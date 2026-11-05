import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON, Table, Integer, Float, Index
from sqlalchemy.orm import relationship
from .session import Base

conversation_participants = Table(
    "conversation_participants",
    Base.metadata,
    Column("user_id", String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("conversation_id", String, ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True),
)

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    display_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversations = relationship("Conversation", secondary=conversation_participants, back_populates="participants")
    messages = relationship("Message", back_populates="sender", cascade="all, delete-orphan")

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kind = Column(String, nullable=False, default="direct") # "direct" or "group"
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    participants = relationship("User", secondary=conversation_participants, back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, default="")
    kind = Column(String, nullable=False, default="text") # "text" or "image"
    status = Column(String, default="sent") # "sent", "delivered", "read"
    created_at = Column(DateTime, default=datetime.utcnow)
    reply_to_id = Column(String, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    image_data = Column(JSON, nullable=True) # stores filename, path etc
    deleted = Column(String, default="false")

    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("User", back_populates="messages")
    reply_to = relationship("Message", remote_side=[id])


class VerificationCache(Base):
    __tablename__ = "verification_cache"

    cache_key = Column(String(64), primary_key=True, index=True)
    raw_claim = Column(Text, nullable=False)
    normalized_claim = Column(Text, nullable=False, index=True)
    language = Column(String(10), nullable=False, default="en")
    mode = Column(String(20), nullable=False, default="standard")
    verdict = Column(String(30), nullable=False)
    analysis_confidence = Column(Float, nullable=False)
    summary = Column(Text, nullable=False)
    reasoning = Column(Text, nullable=False)
    evidence = Column(JSON, nullable=False)
    knowledge_graph = Column(JSON, nullable=False)
    source_diversity = Column(JSON, nullable=True)
    limitations = Column(JSON, nullable=True)
    pipeline_version = Column(String(20), nullable=False, default="3.0.0")
    hit_count = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    last_accessed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_cache_expires_key", "expires_at", "cache_key"),
        Index("idx_cache_normalized_mode", "normalized_claim", "mode"),
    )

