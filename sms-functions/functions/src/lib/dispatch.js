// Shared dispatch — sends a `messages/{id}` document to Africa's Talking.
// Called by both HTTP orchestrators and the retry worker.
// Caller must pass in the three resolved secrets (from defineSecret().value()).

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const africastalking = require('africastalking');

const db = getFirestore();
const OK_CODES = [100, 101, 102];

async function dispatchMessage(messageId, secrets) {
  const { AT_API_KEY, AT_USERNAME, AT_SENDER_ID } = secrets;

  const ref = db.collection('messages').doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) return { skipped: true, reason: 'not found' };

  const data = snap.data();
  if (data.status !== 'PENDING') {
    return { skipped: true, reason: `status=${data.status}` };
  }

  // Lock
  await ref.update({
    status: 'PROCESSING',
    attempts: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const client = africastalking({
    apiKey: AT_API_KEY.value(),
    username: AT_USERNAME.value(),
  });

  try {
    const response = await client.SMS.send({
      to: [data.to],
      message: data.message,
      from: data.from || AT_SENDER_ID.value() || undefined,
      enqueue: true,
    });

    const rec = response?.SMSMessageData?.Recipients?.[0];
    const isSuccess = rec && OK_CODES.includes(rec.statusCode);

    await ref.update({
      status: isSuccess ? 'SENT' : 'FAILED',
      providerMessageId: rec?.messageId || null,
      cost: rec?.cost || '0',
      statusCode: rec?.statusCode || null,
      error: isSuccess ? null : (rec?.status || 'Unknown provider error'),
      sentAt: isSuccess ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('sms_logs').add({
      messageId: ref.id,
      studentId: data.studentId || null,
      studentDocumentId: data.studentDocumentId || null,
      studentName: data.studentName || null,
      guardianPhone: data.to,
      carrier: data.carrier || null,
      term: data.term || null,
      year: data.year || null,
      message: (data.message || '').substring(0, 500),
      status: isSuccess ? 'sent' : 'failed',
      providerResponse: rec
        ? { status: rec.status, messageId: rec.messageId, cost: rec.cost }
        : null,
      sentAt: FieldValue.serverTimestamp(),
      endpoint: data.type || 'single',
      classId: data.classId || null,
      campaignId: data.campaignId || null,
    });

    console.log(`✅ [${ref.id}] ${data.to} → ${isSuccess ? 'SENT' : 'FAILED'} (${rec?.statusCode || 'n/a'})`);
    return { sent: isSuccess, statusCode: rec?.statusCode || null, messageId: rec?.messageId || null };
  } catch (err) {
    console.error(`❌ [${ref.id}] AT error: ${err.message}`);

    await ref.update({
      status: 'FAILED',
      error: err.message || 'Gateway error',
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection('sms_logs').add({
      messageId: ref.id,
      studentId: data.studentId || null,
      studentName: data.studentName || null,
      guardianPhone: data.to,
      status: 'failed',
      error: err.message,
      attemptedAt: FieldValue.serverTimestamp(),
      endpoint: data.type || 'single',
    });

    return { sent: false, error: err.message };
  }
}

module.exports = { dispatchMessage };
