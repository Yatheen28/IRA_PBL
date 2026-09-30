import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMessages, totalUnread } from './messageState.js';

const message = (id, extra = {}) => ({ id, text: 'Hello', status: 'sent', createdAt: `2026-01-01T10:00:0${id}.000Z`, ...extra });

test('history/live-event races deduplicate and preserve chronological order', () => {
  const result = mergeMessages([message('2'), message('3')], [message('1'), message('2')]);
  assert.deepEqual(result.map(item => item.id), ['1', '2', '3']);
});
test('a late send response cannot downgrade a read receipt', () => {
  const result = mergeMessages([message('1', { status: 'read' })], [message('1', { status: 'sent' })]);
  assert.equal(result[0].status, 'read');
});
test('a stale history response cannot restore deleted text, photos, or verification', () => {
  const result = mergeMessages([message('1', { deleted: true, text: '' })], [message('1', { kind: 'image', image: { name: 'photo.png' }, verification: { verdict: 'SUPPORTED' } })]);
  assert.equal(result[0].deleted, true);
  assert.equal(result[0].text, '');
  assert.equal(result[0].image, null);
  assert.equal(result[0].verification, null);
});
test('deleted originals are also removed from loaded quoted replies', () => {
  const result = mergeMessages([message('1'), message('2', { replyTo: message('1') })], [message('1', { deleted: true })]);
  assert.equal(result[1].replyTo.deleted, true);
  assert.equal(result[1].replyTo.text, '');
});
test('unread badges count only positive server-provided unread values', () => {
  assert.equal(totalUnread([{ unreadCount: 2 }, {}, { unreadCount: -1 }, { unreadCount: 3 }]), 5);
});
