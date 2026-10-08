// POST /getSmsHistory
// Body: { limit?, status?, type?, classId?, term?, year?, studentId?, cursor? }
// Returns messages ordered by createdAt desc, cursor-paginated.

const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

const db = getFirestore();
const MAX_LIMIT = 200;

exports.getSmsHistory = onRequest(
  { cors: true, invoker: 'public', timeoutSeconds: 120, memory: '512MiB' },
  async (req, res) => {
    try {
      const {
        limit = 50,
        status,
        type,
        classId,
        term,
        year,
        studentId,
        cursor,
      } = req.body || {};

      const pageSize = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_LIMIT);

      // Firestore requires orderBy + equality filters to have matching indexes.
      // Ordering by createdAt desc is fine on its own; equality filters combine
      // fine as long as the composite index exists (auto-created on first query).
      let q = db.collection('messages').orderBy('createdAt', 'desc');

      if (status)    q = q.where('status', '==', status);
      if (type)      q = q.where('type', '==', type);
      if (classId)   q = q.where('classId', '==', classId);
      if (term)      q = q.where('term', '==', term);
      if (year)      q = q.where('year', '==', year);
      if (studentId) q = q.where('studentId', '==', studentId);

      if (cursor) {
        // cursor is the ISO createdAt of the last item from the previous page
        const cursorDate = new Date(cursor);
        if (!isNaN(cursorDate.getTime())) {
          q = q.startAfter(cursorDate);
        }
      }

      q = q.limit(pageSize);

      const snap = await q.get();

      const messages = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          to: data.to || null,
          message: data.message || '',
          status: data.status || 'UNKNOWN',
          attempts: data.attempts || 0,
          providerMessageId: data.providerMessageId || null,
          cost: data.cost ?? null,
          error: data.error || null,
          statusCode: data.statusCode || null,

          studentId: data.studentId || null,
          studentName: data.studentName || null,
          guardianPhone: data.guardianPhone || null,
          carrier: data.carrier || null,

          term: data.term || null,
          year: data.year || null,
          classId: data.classId || null,
          type: data.type || null,
          campaignId: data.campaignId || null,
          announcementId: data.announcementId || null,

          createdAt: data.createdAt?.toDate?.().toISOString() || null,
          sentAt: data.sentAt?.toDate?.().toISOString() || null,
          deliveredAt: data.deliveredAt?.toDate?.().toISOString() || null,

          deliveryReport: data.deliveryReport
            ? {
                status: data.deliveryReport.status || null,
                phoneNumber: data.deliveryReport.phoneNumber || null,
                failureReason: data.deliveryReport.failureReason || null,
                updatedAt:
                  data.deliveryReport.updatedAt?.toDate?.().toISOString() || null,
              }
            : null,
        };
      });

      const nextCursor =
        messages.length > 0 ? messages[messages.length - 1].createdAt : null;

      return res.json({
        success: true,
        messages,
        nextCursor,
        hasMore: messages.length === pageSize,
        count: messages.length,
      });
    } catch (err) {
      console.error('getSmsHistory:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);