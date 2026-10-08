// POST /retrySms
// Body: { messageId: string }  OR  { messageIds: string[] }
// Reuses the existing message doc. Increments attempts, re-dispatches.

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { dispatchMessage } = require('../lib/dispatch');

const AT_API_KEY   = defineSecret('AT_API_KEY');
const AT_USERNAME  = defineSecret('AT_USERNAME');
const AT_SENDER_ID = defineSecret('AT_SENDER_ID');

const db = getFirestore();
const MAX_RETRIES = 3;
const MAX_BATCH = 100;

const RETRYABLE_STATUSES = ['FAILED', 'REJECTED', 'UNDELIVERED', 'PENDING'];

exports.retrySms = onRequest(
  {
    cors: true,
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [AT_API_KEY, AT_USERNAME, AT_SENDER_ID],
  },
  async (req, res) => {
    try {
      const { messageId, messageIds } = req.body || {};

      let ids = [];
      if (Array.isArray(messageIds) && messageIds.length > 0) ids = messageIds;
      else if (typeof messageId === 'string' && messageId) ids = [messageId];

      if (ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Provide messageId (string) or messageIds (string[]).',
        });
      }

      if (ids.length > MAX_BATCH) {
        return res.status(400).json({
          success: false,
          error: `Max ${MAX_BATCH} message IDs per request.`,
        });
      }

      const results = [];
      let retried = 0;
      let failed = 0;
      let skipped = 0;

      for (const id of ids) {
        try {
          const ref = db.collection('messages').doc(id);
          const snap = await ref.get();

          if (!snap.exists) {
            results.push({ messageId: id, status: 'skipped', reason: 'Message not found' });
            skipped++;
            continue;
          }

          const data = snap.data();
          const attempts = data.attempts || 0;

          if (!RETRYABLE_STATUSES.includes(data.status)) {
            results.push({
              messageId: id,
              status: 'skipped',
              reason: `Status is ${data.status} — not retryable`,
            });
            skipped++;
            continue;
          }

          if (attempts >= MAX_RETRIES) {
            results.push({
              messageId: id,
              status: 'skipped',
              reason: `Max retries reached (${MAX_RETRIES})`,
            });
            skipped++;
            continue;
          }

          // Reset for retry
          await ref.update({
            status: 'PENDING',
            error: null,
            statusCode: null,
            providerMessageId: null,
            updatedAt: FieldValue.serverTimestamp(),
          });

          const result = await dispatchMessage(id, {
            AT_API_KEY,
            AT_USERNAME,
            AT_SENDER_ID,
          });

          if (result.sent) {
            retried++;
            results.push({
              messageId: id,
              status: 'sent',
              studentName: data.studentName || null,
            });
          } else {
            failed++;
            results.push({
              messageId: id,
              status: 'failed',
              studentName: data.studentName || null,
              reason: result.error || 'Dispatch failed',
            });
          }
        } catch (err) {
          console.error(`Retry error ${id}:`, err);
          failed++;
          results.push({ messageId: id, status: 'failed', reason: err.message });
        }
      }

      return res.json({
        success: true,
        total: ids.length,
        retried,
        failed,
        skipped,
        results,
      });
    } catch (err) {
      console.error('retrySms:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);