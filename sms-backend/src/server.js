const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const africastalking = require('africastalking');
require('dotenv').config();

// Initialize Firebase
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Africa's Talking
const africasTalking = africastalking({
  apiKey: process.env.AFRICASTALKING_API_KEY,
  username: process.env.AFRICASTALKING_USERNAME,
});
const sms = africasTalking.SMS;

// ==================== ZAMBIA PHONE VALIDATION ====================

/**
 * Detect mobile carrier based on Zambia number prefixes
 * @param {string} phone - Cleaned phone number (260XXXXXXXXX)
 * @returns {string} Carrier name
 */
const getCarrier = (phone) => {
  if (!phone) return 'UNKNOWN';
  
  // MTN: 96 and 76 prefixes
  if (/^260(96|76)/.test(phone)) return 'MTN';
  
  // AIRTEL: 97 and 77 prefixes
  if (/^260(97|77)/.test(phone)) return 'AIRTEL';
  
  // ZAMTEL: 95 and 75 prefixes
  if (/^260(95|75)/.test(phone)) return 'ZAMTEL';
  
  // ZedMobile: 98 and 78 prefixes
  if (/^260(98|78)/.test(phone)) return 'ZedMobile';
  
  return 'UNKNOWN';
};

/**
 * Validate and format Zambia phone number
 * @param {string} phone - Raw phone input
 * @returns {object|null} { number: string, carrier: string } or null if invalid
 */
const validateZambianNumber = (phone) => {
  if (!phone) return null;
  
  // Convert to string and trim
  let cleaned = phone.toString().trim();
  
  // Remove any whitespace and special characters
  cleaned = cleaned.replace(/\s+/g, '').replace(/[()-]/g, '');
  
  // Remove '+' if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // Convert from 0xxx to 260xxx (Zambia country code)
  if (cleaned.startsWith('0')) {
    cleaned = '260' + cleaned.substring(1);
  }
  
  // Validate Zambia format: 260 + (95|96|97|98|75|76|77|78) + 7 digits
  const validPattern = /^260(75|76|77|78|95|96|97|98)\d{7}$/;
  
  if (!validPattern.test(cleaned)) {
    console.log(`❌ Invalid Zambia number: ${phone} -> ${cleaned}`);
    return null;
  }
  
  return {
    number: cleaned,
    carrier: getCarrier(cleaned)
  };
};

/**
 * Check if Zambia number format is valid (for quick validation without carrier)
 */
const isValidZambianNumber = (phone) => {
  return validateZambianNumber(phone) !== null;
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get active exam types for a term/year
 */
async function getActiveExamTypes(term, year) {
  try {
    const configSnapshot = await db.collection('examConfigs')
      .where('term', '==', term)
      .where('year', '==', year)
      .limit(1)
      .get();
    
    if (configSnapshot.empty) {
      // Default to all exams if no config found
      return ['week4', 'week8', 'endOfTerm'];
    }
    
    const config = configSnapshot.docs[0].data();
    const activeExams = [];
    if (config.examTypes?.week4) activeExams.push('week4');
    if (config.examTypes?.week8) activeExams.push('week8');
    if (config.examTypes?.endOfTerm) activeExams.push('endOfTerm');
    
    return activeExams.length > 0 ? activeExams : ['week4', 'week8', 'endOfTerm'];
  } catch (error) {
    console.error('Error getting exam config:', error);
    return ['week4', 'week8', 'endOfTerm'];
  }
}

/**
 * Get student's results for specific exams
 */
async function getStudentResults(studentDocumentId, term, year, examTypes) {
  try {
    const results = {};
    
    for (const examType of examTypes) {
      const resultQuery = await db.collection('results')
        .where('studentId', '==', studentDocumentId)
        .where('term', '==', term)
        .where('year', '==', year)
        .where('examType', '==', examType)
        .limit(1)
        .get();
      
      if (!resultQuery.empty) {
        const resultData = resultQuery.docs[0].data();
        results[examType] = {
          marks: resultData.marks,
          percentage: resultData.percentage,
          subjectResults: resultData.subjectResults || {}
        };
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error getting student results:', error);
    return {};
  }
}

/**
 * Get student results by subject (better format for SMS)
 */
async function getStudentResultsBySubject(studentDocumentId, term, year, examTypes) {
  try {
    const resultQuery = await db.collection('results')
      .where('studentId', '==', studentDocumentId)
      .where('term', '==', term)
      .where('year', '==', year)
      .get();
    
    const subjectResults = new Map();
    
    resultQuery.docs.forEach(doc => {
      const data = doc.data();
      if (examTypes.includes(data.examType)) {
        if (!subjectResults.has(data.subjectName)) {
          subjectResults.set(data.subjectName, {
            subjectName: data.subjectName,
            subjectId: data.subjectId,
            week4: null,
            week8: null,
            endOfTerm: null
          });
        }
        const subject = subjectResults.get(data.subjectName);
        if (data.examType === 'week4') subject.week4 = data.percentage;
        if (data.examType === 'week8') subject.week8 = data.percentage;
        if (data.examType === 'endOfTerm') subject.endOfTerm = data.percentage;
      }
    });
    
    return Array.from(subjectResults.values());
  } catch (error) {
    console.error('Error getting subject results:', error);
    return [];
  }
}

/**
 * Calculate grade from percentage
 */
function calculateGrade(percentage) {
  if (percentage >= 75) return { grade: 1, desc: 'Distinction' };
  if (percentage >= 70) return { grade: 2, desc: 'Distinction' };
  if (percentage >= 65) return { grade: 3, desc: 'Merit' };
  if (percentage >= 60) return { grade: 4, desc: 'Merit' };
  if (percentage >= 55) return { grade: 5, desc: 'Credit' };
  if (percentage >= 50) return { grade: 6, desc: 'Credit' };
  if (percentage >= 45) return { grade: 7, desc: 'Satisfactory' };
  if (percentage >= 40) return { grade: 8, desc: 'Satisfactory' };
  return { grade: 9, desc: 'Unsatisfactory' };
}

/**
 * Format SMS message for guardian
 */
async function formatSMSMessage(studentDocumentId, studentId, term, year, guardianName, studentData, classData) {
  try {
    // Get active exams for this term
    const activeExams = await getActiveExamTypes(term, year);
    
    // Get results by subject
    const subjectResults = await getStudentResultsBySubject(studentDocumentId, term, year, activeExams);
    
    // Build message - SMS length limit ~160 chars per segment, keep concise
    let message = `KALABO SEC SCHOOL\n`;
    message += `${term} ${year} RESULTS\n`;
    message += `─────────────\n`;
    message += `Student: ${studentData.fullName || studentData.name || 'N/A'}\n`;
    message += `ID: ${studentId}\n`;
    message += `Class: ${classData?.name || 'N/A'}\n`;
    message += `─────────────\n`;
    
    // Show subject results (limit to top subjects to avoid SMS splitting)
    let hasResults = false;
    let totalPercentage = 0;
    let subjectCount = 0;
    let displayedCount = 0;
    const maxSubjects = 5; // Limit to 5 subjects per SMS to avoid splitting
    
    for (const subject of subjectResults) {
      // Get the most recent exam result (priority: endOfTerm > week8 > week4)
      let latestScore = null;
      if (subject.endOfTerm !== null) latestScore = subject.endOfTerm;
      else if (subject.week8 !== null) latestScore = subject.week8;
      else if (subject.week4 !== null) latestScore = subject.week4;
      
      if (latestScore !== null && displayedCount < maxSubjects) {
        hasResults = true;
        const subjectShort = subject.subjectName.length > 12 
          ? subject.subjectName.substring(0, 10) + '..' 
          : subject.subjectName;
        message += `${subjectShort}: ${Math.round(latestScore)}%\n`;
        totalPercentage += latestScore;
        subjectCount++;
        displayedCount++;
      }
    }
    
    if (!hasResults) {
      message += `No results available yet.\n`;
    } else {
      // Calculate and add overall average
      const overallAvg = subjectCount > 0 ? Math.round(totalPercentage / subjectCount) : 0;
      const gradeInfo = calculateGrade(overallAvg);
      
      message += `─────────────\n`;
      message += `AVG: ${overallAvg}% - ${gradeInfo.desc}\n`;
    }
    
    message += `─────────────\n`;
    message += `Thank you,\nKalabo Secondary School`;
    
    // Truncate if too long (max 480 chars for 3 segments)
    if (message.length > 480) {
      message = message.substring(0, 450) + '...';
    }
    
    return message;
  } catch (error) {
    console.error('Error formatting message:', error);
    return `Dear Guardian,\n\nResults for ${studentId} are available.\nPlease contact the school for details.\n\nKalabo Secondary School`;
  }
}

/**
 * Resolve student by ID (handles both custom ID and document ID)
 */
async function resolveStudent(studentId) {
  try {
    // Try by custom studentId field
    const customIdQuery = await db.collection('learners')
      .where('studentId', '==', studentId)
      .limit(1)
      .get();
    
    if (!customIdQuery.empty) {
      const doc = customIdQuery.docs[0];
      return {
        documentId: doc.id,
        customId: studentId,
        data: doc.data()
      };
    }
    
    // Try by document ID
    const docRef = db.collection('learners').doc(studentId);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const data = docSnap.data();
      const customId = data.studentId || data.id || studentId;
      return {
        documentId: studentId,
        customId,
        data
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error resolving student:', error);
    return null;
  }
}

// ==================== API ENDPOINTS ====================

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    firebase: admin.apps.length > 0 ? 'connected' : 'failed',
    smsConfigured: !!process.env.AFRICASTALKING_API_KEY && !!process.env.AFRICASTALKING_SHORTCODE
  });
});

/**
 * Get student by ID with phone validation info
 */
app.get('/api/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await resolveStudent(studentId);
    
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const rawPhone = student.data.guardianPhone || 
                     student.data.parentPhone || 
                     student.data.phone || 
                     student.data.contactNumber;
    
    const phoneValidation = rawPhone ? validateZambianNumber(rawPhone) : null;
    
    res.json({ 
      id: student.customId,
      documentId: student.documentId,
      ...student.data,
      hasGuardianPhone: !!rawPhone,
      phoneValid: !!phoneValidation,
      phoneCarrier: phoneValidation?.carrier || null,
      rawPhone: rawPhone || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send SMS to single student's guardian - LIVE VERSION
 */
app.post('/api/send-sms', async (req, res) => {
  try {
    const { studentId, term, year } = req.body;
    
    if (!studentId || !term || !year) {
      return res.status(400).json({ error: 'Missing studentId, term, or year' });
    }
    
    console.log(`📱 Sending SMS for student: ${studentId}, ${term} ${year}`);
    
    // Resolve student (handles both custom ID and document ID)
    const student = await resolveStudent(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    const studentData = student.data;
    const guardianName = studentData.guardian || 'Guardian';
    
    // Try multiple possible phone fields
    const rawPhone = studentData.guardianPhone || 
                     studentData.parentPhone || 
                     studentData.phone || 
                     studentData.contactNumber;
    
    if (!rawPhone) {
      return res.status(400).json({ 
        error: 'No guardian phone number on file',
        studentId: student.customId
      });
    }
    
    // Validate Zambia phone number
    const validated = validateZambianNumber(rawPhone);
    if (!validated) {
      return res.status(400).json({ 
        error: `Invalid Zambia number: ${rawPhone}`,
        studentId: student.customId,
        rawPhone
      });
    }
    
    console.log(`📞 Sending to: ${validated.number} (${validated.carrier})`);
    
    // Get class data
    let classData = null;
    if (studentData.classId) {
      const classDoc = await db.collection('classes').doc(studentData.classId).get();
      if (classDoc.exists) {
        classData = classDoc.data();
      }
    }
    
    // Format message
    const message = await formatSMSMessage(
      student.documentId, 
      student.customId, 
      term, 
      year, 
      guardianName, 
      studentData, 
      classData
    );
    console.log(`📝 Message length: ${message.length} chars`);
    
    // ==================== LIVE SMS SENDING ====================
    let smsResult;
    let smsStatus = 'failed';
    let providerResponse = null;
    
    try {
      smsResult = await sms.send({
        to: validated.number,
        message: message,
        from: process.env.AFRICASTALKING_SHORTCODE
      });
      
      console.log('✅ SMS sent:', JSON.stringify(smsResult));
      
      // Parse Africa's Talking response
      if (smsResult && smsResult.SMSMessageData) {
        const recipients = smsResult.SMSMessageData.Recipients;
        if (recipients && recipients.length > 0) {
          smsStatus = recipients[0].status || 'sent';
          providerResponse = recipients[0];
        } else {
          smsStatus = 'sent';
        }
      } else {
        smsStatus = 'sent';
      }
    } catch (smsError) {
      console.error('❌ Africa\'s Talking error:', smsError);
      smsStatus = 'failed';
      providerResponse = smsError.message;
      throw smsError;
    }
    
    // Log to Firestore
    await db.collection('sms_logs').add({
      studentId: student.customId,
      studentDocumentId: student.documentId,
      guardianPhone: validated.number,
      carrier: validated.carrier,
      term,
      year,
      message: message.substring(0, 500),
      status: smsStatus,
      providerResponse: providerResponse,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      endpoint: 'single'
    });
    
    res.json({ 
      success: true, 
      message: 'SMS sent successfully',
      carrier: validated.carrier,
      phoneNumber: validated.number,
      status: smsStatus
    });
    
  } catch (error) {
    console.error('Error sending SMS:', error);
    
    // Log failure to Firestore
    try {
      await db.collection('sms_logs').add({
        studentId: req.body.studentId || 'unknown',
        error: error.message,
        status: 'failed',
        attemptedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * Bulk send SMS to all students in a class - LIVE VERSION
 */
app.post('/api/bulk-send', async (req, res) => {
  try {
    const { classId, term, year } = req.body;
    
    if (!classId || !term || !year) {
      return res.status(400).json({ error: 'Missing classId, term, or year' });
    }
    
    console.log(`📱 Bulk sending to class: ${classId}, ${term} ${year}`);
    
    // Get all students in class
    const studentsSnapshot = await db.collection('learners')
      .where('classId', '==', classId)
      .where('status', '==', 'active')
      .get();
    
    if (studentsSnapshot.empty) {
      return res.status(404).json({ error: 'No students found in this class' });
    }
    
    // Get class data once
    const classDoc = await db.collection('classes').doc(classId).get();
    const classData = classDoc.exists ? classDoc.data() : null;
    
    const results = [];
    const failed = [];
    let sentCount = 0;
    
    for (const doc of studentsSnapshot.docs) {
      const studentData = doc.data();
      const studentDocumentId = doc.id;
      const customStudentId = studentData.studentId || studentDocumentId;
      
      // Try multiple possible phone fields
      const rawPhone = studentData.guardianPhone || 
                       studentData.parentPhone || 
                       studentData.phone || 
                       studentData.contactNumber;
      
      if (!rawPhone) {
        failed.push({ studentId: customStudentId, reason: 'No guardian phone' });
        continue;
      }
      
      const validated = validateZambianNumber(rawPhone);
      if (!validated) {
        failed.push({ studentId: customStudentId, reason: `Invalid Zambia number: ${rawPhone}` });
        continue;
      }
      
      try {
        const message = await formatSMSMessage(
          studentDocumentId, 
          customStudentId, 
          term, 
          year, 
          studentData.guardian || 'Guardian', 
          studentData, 
          classData
        );
        
        // ==================== LIVE SMS SENDING ====================
        let smsStatus = 'failed';
        let providerResponse = null;
        
        try {
          const smsResult = await sms.send({
            to: validated.number,
            message: message,
            from: process.env.AFRICASTALKING_SHORTCODE
          });
          
          if (smsResult && smsResult.SMSMessageData) {
            const recipients = smsResult.SMSMessageData.Recipients;
            if (recipients && recipients.length > 0) {
              smsStatus = recipients[0].status || 'sent';
              providerResponse = recipients[0];
            } else {
              smsStatus = 'sent';
            }
          } else {
            smsStatus = 'sent';
          }
          
          sentCount++;
          results.push({ 
            studentId: customStudentId, 
            phoneNumber: validated.number, 
            carrier: validated.carrier,
            status: smsStatus 
          });
          
        } catch (smsError) {
          console.error(`Failed to send to ${customStudentId}:`, smsError.message);
          failed.push({ studentId: customStudentId, reason: smsError.message });
          providerResponse = smsError.message;
        }
        
        // Log to Firestore
        await db.collection('sms_logs').add({
          studentId: customStudentId,
          studentDocumentId,
          guardianPhone: validated.number,
          carrier: validated.carrier,
          term,
          year,
          message: message.substring(0, 500),
          status: smsStatus,
          providerResponse: providerResponse,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          endpoint: 'bulk',
          classId
        });
        
        // Rate limiting delay to avoid overwhelming API
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error processing ${customStudentId}:`, error);
        failed.push({ studentId: customStudentId, reason: error.message });
      }
    }
    
    res.json({
      success: true,
      total: studentsSnapshot.size,
      sent: sentCount,
      failed: failed.length,
      results,
      failedList: failed
    });
    
  } catch (error) {
    console.error('Bulk send error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get SMS logs for a student
 */
app.get('/api/sms-logs/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const logsSnapshot = await db.collection('sms_logs')
      .where('studentId', '==', studentId)
      .orderBy('sentAt', 'desc')
      .limit(50)
      .get();
    
    const logs = [];
    logsSnapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
    
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get SMS logs for a class (bulk view)
 */
app.get('/api/sms-logs/class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;
    const { limit = 100 } = req.query;
    
    const logsSnapshot = await db.collection('sms_logs')
      .where('classId', '==', classId)
      .orderBy('sentAt', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const logs = [];
    logsSnapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
    
    res.json({ logs, count: logs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get SMS statistics
 */
app.get('/api/sms-stats', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    
    const logsSnapshot = await db.collection('sms_logs')
      .where('sentAt', '>=', cutoffDate)
      .get();
    
    let total = 0;
    let sent = 0;
    let failed = 0;
    const carrierStats = {
      MTN: 0,
      AIRTEL: 0,
      ZAMTEL: 0,
      ZedMobile: 0,
      UNKNOWN: 0
    };
    
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      total++;
      if (data.status === 'sent' || data.status === 'Success') {
        sent++;
      } else {
        failed++;
      }
      
      const carrier = data.carrier || 'UNKNOWN';
      if (carrierStats[carrier] !== undefined) {
        carrierStats[carrier]++;
      } else {
        carrierStats.UNKNOWN++;
      }
    });
    
    res.json({
      period: `${days} days`,
      total,
      sent,
      failed,
      successRate: total > 0 ? Math.round((sent / total) * 100) : 0,
      carrierStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ SMS Server running on http://localhost:${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📞 SMS mode: LIVE (Africa's Talking enabled)`);
  console.log(`🌍 Phone validation: Zambia (260)`);
  console.log(`📡 Carriers: MTN, AIRTEL, ZAMTEL, ZedMobile`);
  console.log(`💡 Test with: POST /api/send-sms`);
});