"""
VAJRA Chat — Chat routes.
REST endpoints for auth, conversations, messages, and a WebSocket for real-time events.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
import os
import shutil
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, Request, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User, Conversation, Message, conversation_participants
from app.services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["Chat"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    password: str
    displayName: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    displayName: str
    token: Optional[str] = None

class ConversationCreate(BaseModel):
    participantId: str

class MessageCreate(BaseModel):
    text: str
    replyToId: Optional[str] = None

class MessageResponse(BaseModel):
    id: str
    conversationId: str
    senderId: str
    text: str
    kind: str
    status: str
    createdAt: str
    replyToId: Optional[str] = None
    deleted: bool = False


# ── Auth dependency ───────────────────────────────────────────────────────────

def get_current_user(
    token: str = Query(None, alias="token"),
    db: Session = Depends(get_db),
) -> User:
    """Extract and validate the user from a bearer token (header or query param)."""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_user_from_header(authorization: str = None, db: Session = Depends(get_db)) -> User:
    """Extract user from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = authorization[7:]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── Helper: extract token from request ────────────────────────────────────────

from fastapi import Request

async def _auth_from_request(request: Request, db: Session) -> User:
    """Try Authorization header first, then query param."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        token = request.query_params.get("token", "")
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── POST /chat/register ──────────────────────────────────────────────────────

@router.post("/register")
async def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user account."""
    username = body.username.strip().lower()
    if not username or len(username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters")
    if not body.password or len(body.password) < 3:
        raise HTTPException(status_code=400, detail="Password must be at least 3 characters")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        id=str(uuid.uuid4()),
        username=username,
        password_hash=hash_password(body.password),
        display_name=body.displayName or username.capitalize(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.username)
    logger.info("User registered: %s (%s)", user.username, user.id)

    return {
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name,
        "token": token,
    }


# ── POST /chat/login ─────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate and return a bearer token."""
    username = body.username.strip().lower()
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user.id, user.username)
    logger.info("User logged in: %s", user.username)

    return {
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name,
        "token": token,
    }


# ── GET /chat/users ──────────────────────────────────────────────────────────

@router.get("/users")
async def search_users(
    request: Request,
    q: str = "",
    db: Session = Depends(get_db),
):
    """Search for users by username or display name."""
    user = await _auth_from_request(request, db)
    query = q.strip().lower()
    if not query:
        users = db.query(User).filter(User.id != user.id).limit(20).all()
    else:
        users = (
            db.query(User)
            .filter(User.id != user.id)
            .filter(
                (User.username.ilike(f"%{query}%"))
                | (User.display_name.ilike(f"%{query}%"))
            )
            .limit(20)
            .all()
        )
    return [
        {"id": u.id, "username": u.username, "displayName": u.display_name}
        for u in users
    ]


# ── GET /chat/conversations ──────────────────────────────────────────────────

@router.get("/conversations")
async def list_conversations(request: Request, db: Session = Depends(get_db)):
    """List all conversations for the authenticated user."""
    user = await _auth_from_request(request, db)
    convos = (
        db.query(Conversation)
        .filter(Conversation.participants.any(User.id == user.id))
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    result = []
    for convo in convos:
        last_msg = (
            db.query(Message)
            .filter(Message.conversation_id == convo.id)
            .order_by(Message.created_at.desc())
            .first()
        )
        unread = (
            db.query(Message)
            .filter(
                Message.conversation_id == convo.id,
                Message.sender_id != user.id,
                Message.status != "read",
            )
            .count()
        )
        result.append({
            "id": convo.id,
            "kind": convo.kind,
            "participants": [
                {"id": p.id, "username": p.username, "displayName": p.display_name}
                for p in convo.participants
            ],
            "lastMessage": _format_message(last_msg) if last_msg else None,
            "updatedAt": convo.updated_at.isoformat() if convo.updated_at else None,
            "unreadCount": unread,
        })
    return result


# ── POST /chat/conversations ─────────────────────────────────────────────────

@router.post("/conversations")
async def create_conversation(
    body: ConversationCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Create a new direct conversation with another user."""
    user = await _auth_from_request(request, db)
    peer = db.query(User).filter(User.id == body.participantId).first()
    if not peer:
        raise HTTPException(status_code=404, detail="User not found")
    if peer.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot create conversation with yourself")

    # Check if a direct conversation already exists between these two users
    existing = (
        db.query(Conversation)
        .filter(
            Conversation.kind == "direct",
            Conversation.participants.any(User.id == user.id),
            Conversation.participants.any(User.id == peer.id),
        )
        .first()
    )
    if existing:
        return {
            "id": existing.id,
            "kind": existing.kind,
            "participants": [
                {"id": p.id, "username": p.username, "displayName": p.display_name}
                for p in existing.participants
            ],
            "lastMessage": None,
            "updatedAt": existing.updated_at.isoformat() if existing.updated_at else None,
            "unreadCount": 0,
        }

    convo = Conversation(
        id=str(uuid.uuid4()),
        kind="direct",
        updated_at=datetime.now(timezone.utc),
    )
    convo.participants.append(user)
    convo.participants.append(peer)
    db.add(convo)
    db.commit()
    db.refresh(convo)

    logger.info("Conversation created: %s between %s and %s", convo.id, user.username, peer.username)

    # Notify peer via WebSocket
    await _broadcast(peer.id, {
        "type": "conversation:new",
        "conversation": {
            "id": convo.id,
            "kind": convo.kind,
            "participants": [
                {"id": p.id, "username": p.username, "displayName": p.display_name}
                for p in convo.participants
            ],
            "lastMessage": None,
            "updatedAt": convo.updated_at.isoformat(),
            "unreadCount": 0,
        },
    })

    return {
        "id": convo.id,
        "kind": convo.kind,
        "participants": [
            {"id": p.id, "username": p.username, "displayName": p.display_name}
            for p in convo.participants
        ],
        "lastMessage": None,
        "updatedAt": convo.updated_at.isoformat(),
        "unreadCount": 0,
    }


# ── GET /chat/conversations/{id}/messages ─────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    request: Request,
    limit: int = 50,
    before: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get messages for a conversation with pagination."""
    user = await _auth_from_request(request, db)
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not any(p.id == user.id for p in convo.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    query = db.query(Message).filter(Message.conversation_id == conversation_id)
    if before:
        query = query.filter(Message.created_at < before)
    msgs = query.order_by(Message.created_at.asc()).limit(limit).all()
    has_more = query.count() > limit

    return {
        "messages": [_format_message(m) for m in msgs],
        "hasMore": has_more,
    }


# ── POST /chat/conversations/{id}/messages ────────────────────────────────────

@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    """Send a text message to a conversation."""
    user = await _auth_from_request(request, db)
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not any(p.id == user.id for p in convo.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        sender_id=user.id,
        text=body.text,
        kind="text",
        status="sent",
        created_at=datetime.now(timezone.utc),
        reply_to_id=body.replyToId,
    )
    db.add(msg)
    convo.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    formatted = _format_message(msg)

    # Broadcast to all participants via WebSocket
    for participant in convo.participants:
        await _broadcast(participant.id, {
            "type": "message:new",
            "conversationId": conversation_id,
            "message": formatted,
        })

    # Mark as delivered after broadcast
    msg.status = "delivered"
    db.commit()

    return formatted
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── POST /chat/conversations/{id}/messages/image ──────────────────────────────

@router.post("/conversations/{conversation_id}/messages/image")
async def send_image_message(
    conversation_id: str,
    request: Request,
    image: UploadFile = File(...),
    text: Optional[str] = Form(None),
    replyToId: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Send an image message to a conversation."""
    user = await _auth_from_request(request, db)
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if not any(p.id == user.id for p in convo.participants):
        raise HTTPException(status_code=403, detail="Not a participant")

    # Save the image
    ext = os.path.splitext(image.filename)[1]
    if not ext:
        ext = ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        sender_id=user.id,
        text=text or "",
        kind="image",
        status="sent",
        created_at=datetime.now(timezone.utc),
        reply_to_id=replyToId,
        image_data={
            "name": image.filename,
            "path": filepath,
            "size": getattr(image, 'size', 0)
        }
    )
    db.add(msg)
    convo.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    formatted = _format_message(msg)

    # Broadcast to all participants via WebSocket
    for participant in convo.participants:
        await _broadcast(participant.id, {
            "type": "message:new",
            "conversationId": conversation_id,
            "message": formatted,
        })

    # Mark as delivered after broadcast
    msg.status = "delivered"
    db.commit()

    return formatted


# ── GET /chat/messages/{id}/image ─────────────────────────────────────────────

@router.get("/messages/{message_id}/image")
async def get_message_image(
    message_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Get the image data for a message."""
    user = await _auth_from_request(request, db)
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg or msg.kind != "image" or not msg.image_data:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Verify user is in conversation
    convo = db.query(Conversation).filter(Conversation.id == msg.conversation_id).first()
    if not convo or not any(p.id == user.id for p in convo.participants):
        raise HTTPException(status_code=403, detail="Not authorized")

    filepath = msg.image_data.get("path")
    if not filepath or not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Image file missing")
        
    return FileResponse(filepath)


# ── DELETE /chat/conversations/{id}/messages/{msg_id} ─────────────────────────

@router.delete("/conversations/{conversation_id}/messages/{message_id}")
async def delete_message(
    conversation_id: str,
    message_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Delete (soft) a message."""
    user = await _auth_from_request(request, db)
    msg = db.query(Message).filter(
        Message.id == message_id,
        Message.conversation_id == conversation_id,
        Message.sender_id == user.id,
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found or not yours")

    msg.deleted = "true"
    msg.text = ""
    msg.image_data = None
    db.commit()

    # Broadcast deletion
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if convo:
        for participant in convo.participants:
            await _broadcast(participant.id, {
                "type": "message:deleted",
                "conversationId": conversation_id,
                "messageId": message_id,
            })

    return {"ok": True}


# ── POST /chat/conversations/{id}/read ────────────────────────────────────────

@router.post("/conversations/{conversation_id}/read")
async def mark_read(
    conversation_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Mark all messages in a conversation as read by the current user."""
    user = await _auth_from_request(request, db)
    db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.sender_id != user.id,
        Message.status != "read",
    ).update({"status": "read"})
    db.commit()
    return {"ok": True}


# ── Message formatting helper ─────────────────────────────────────────────────

def _format_message(msg: Message) -> dict:
    """Convert a Message ORM object to a JSON-serializable dict."""
    return {
        "id": msg.id,
        "conversationId": msg.conversation_id,
        "senderId": msg.sender_id,
        "text": msg.text or "",
        "kind": msg.kind,
        "status": msg.status,
        "createdAt": msg.created_at.isoformat() if msg.created_at else None,
        "replyToId": msg.reply_to_id,
        "deleted": msg.deleted == "true",
        "image": msg.image_data,
    }


# ── WebSocket connection manager ──────────────────────────────────────────────

_connections: dict[str, list[WebSocket]] = {}


async def _broadcast(user_id: str, data: dict):
    """Send a JSON message to all WebSocket connections for a given user."""
    connections = _connections.get(user_id, [])
    dead = []
    for ws in connections:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connections.remove(ws)


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(""),
    db: Session = Depends(get_db),
):
    """WebSocket endpoint for real-time chat events."""
    # Authenticate
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = payload["sub"]
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        await websocket.close(code=4001, reason="User not found")
        return

    await websocket.accept()

    # Register connection
    if user_id not in _connections:
        _connections[user_id] = []
    _connections[user_id].append(websocket)

    logger.info("WebSocket connected: %s (%s)", user.username, user_id)

    # Broadcast online presence to conversations
    for convo in user.conversations:
        for p in convo.participants:
            if p.id != user_id:
                await _broadcast(p.id, {
                    "type": "presence",
                    "userId": user_id,
                    "online": True,
                })

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            # Handle typing indicators
            if msg.get("type") == "typing":
                convo_id = msg.get("conversationId")
                if convo_id:
                    convo = db.query(Conversation).filter(Conversation.id == convo_id).first()
                    if convo:
                        for p in convo.participants:
                            if p.id != user_id:
                                await _broadcast(p.id, {
                                    "type": "typing",
                                    "conversationId": convo_id,
                                    "userId": user_id,
                                    "typing": msg.get("typing", False),
                                })

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WebSocket error for %s: %s", user.username, exc)
    finally:
        # Unregister connection
        if user_id in _connections:
            try:
                _connections[user_id].remove(websocket)
            except ValueError:
                pass
            if not _connections[user_id]:
                del _connections[user_id]

        # Broadcast offline presence
        for convo in user.conversations:
            for p in convo.participants:
                if p.id != user_id:
                    await _broadcast(p.id, {
                        "type": "presence",
                        "userId": user_id,
                        "online": False,
                    })

        logger.info("WebSocket disconnected: %s", user.username)
