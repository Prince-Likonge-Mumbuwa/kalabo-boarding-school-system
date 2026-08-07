// sms-backend/server.js - FULLY WORKING VERSION (FIXED)
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
const credentials = {
  apiKey: process.env.AFRICASTALKING_API_KEY,
  username: process.env.AFRICASTALKING_USERNAME,
};

// Check if credentials are configured
if (!credentials.apiKey || !credentials.username) {
  console.error('❌ AFRICASTALKING_API_KEY or AFRICASTALKING_USERNAME not set in .env');
  console.log('📝 Create a .env file with:');
  console.log('   AFRICASTALKING_API_KEY=your_api_key');
  console.log('   AFRICASTALKING_USERNAME=your_username');
  console.log('   AFRICASTALKING_SHORTCODE=your_sender_id');
}

let sms = null;
try {
  const africasTalking = africastalking(credentials);
  sms = africasTalking.SMS;
} catch (error) {
  console.error('❌ Failed to initialize Africa\'s Talking:', error.message);
}

// Use sender ID from env or default
const SENDER_ID = process.env.AFRICASTALKING_SHORTCODE || 'KBSS';

console.log('═══════════════════════════════════════');
console.log('📱 SMS Service Configuration:');
console.log(`   API Key: ${credentials.apiKey ? '✅ Set' : '❌ Missing'}`);
console.log(`   Username: ${credentials.username ? '✅ Set' : '❌ Missing'}`);
console.log(`   Sender ID: ${SENDER_ID}`);
console.log('═══════════════════════════════════════');

// ==================== ZAMBIA PHONE VALIDATION ====================

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
  
  return 'OTHER';
};

const validateZambianNumber = (phone) => {
  if (!phone) return null;
  
  // Convert to string and clean
  let cleaned = String(phone).trim();
  cleaned = cleaned.replace(/[\s\-\(\)]+/g, '');
  
  // Remove leading '+'
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // Convert 0XXX to 260XXX
  if (cleaned.startsWith('0')) {
    cleaned = '260' + cleaned.substring(1);
  }
  
  // Must start with 260
  if (!cleaned.startsWith('260')) {
    cleaned = '260' + cleaned;
  }
  
  // Validate: 260 + valid prefix + 7 digits
  const validPattern = /^260(75|76|77|78|95|96|97|98)\d{7}$/;
  
  if (!validPattern.test(cleaned)) {
    console.log(`   ❌ Invalid: "${phone}" -> "${cleaned}"`);
    return null;
  }
  
  return {
    number: '+' + cleaned,  // ← FIXED: Add '+' prefix for Africa's Talking
    carrier: getCarrier(cleaned)
  };
};

// ==================== HELPER FUNCTIONS ====================

async function getActiveExamTypes(term, year) {
  try {
    const configSnapshot = await db.collection('examConfigs')
      .where('term', '==', term)
      .where('year', '==', year)
      .limit(1)
      .get();
    
    if (configSnapshot.empty) {
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

async function getStudentResultsBySubject(studentDocumentId, term, year, examTypes) {
  try {
    const resultQuery = await db.collection('results')
      .where('studentId', '==', studentDocumentId)
      .where('term', '==', term)
      .where('year', '==', year)
      .get();
    
    const subjectMap = new Map();
    
    resultQuery.docs.forEach(doc => {
      const data = doc.data();
      if (examTypes.includes(data.examType)) {
        if (!subjectMap.has(data.subjectName)) {
          subjectMap.set(data.subjectName, {
            subjectName: data.subjectName,
            subjectId: data.subjectId,
            week4: null,
            week8: null,
            endOfTerm: null
          });
        }
        const subject = subjectMap.get(data.subjectName);
        if (data.examType === 'week4') subject.week4 = data.percentage;
        if (data.examType === 'week8') subject.week8 = data.percentage;
        if (data.examType === 'endOfTerm') subject.endOfTerm = data.percentage;
      }
    });
    
    return Array.from(subjectMap.values());
  } catch (error) {
    console.error('Error getting subject results:', error);
    return [];
  }
}

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

async function formatSMSMessage(studentDocumentId, studentId, term, year, studentData, classData) {
  try {
    const activeExams = await getActiveExamTypes(term, year);
    const subjectResults = await getStudentResultsBySubject(studentDocumentId, term, year, activeExams);
    
    let message = `KALABO SEC SCHOOL\n`;
    message += `${term} ${year} RESULTS\n`;
    message += `Student: ${studentData.fullName || studentData.name || 'N/A'}\n`;
    message += `ID: ${studentId}\n`;
    message += `Class: ${classData?.name || 'N/A'}\n`;
    message += `────────────────\n`;
    
    let hasResults = false;
    let totalPercentage = 0;
    let subjectCount = 0;
    let displayedCount = 0;
    const maxSubjects = 5;
    
    for (const subject of subjectResults) {
      let latestScore = null;
      if (subject.endOfTerm !== null && subject.endOfTerm !== undefined) {
        latestScore = subject.endOfTerm;
      } else if (subject.week8 !== null && subject.week8 !== undefined) {
        latestScore = subject.week8;
      } else if (subject.week4 !== null && subject.week4 !== undefined) {
        latestScore = subject.week4;
      }
      
      if (latestScore !== null && latestScore >= 0 && displayedCount < maxSubjects) {
        hasResults = true;
        const shortName = subject.subjectName.length > 12 
          ? subject.subjectName.substring(0, 10) + '..' 
          : subject.subjectName;
        message += `${shortName}: ${Math.round(latestScore)}%\n`;
        totalPercentage += latestScore;
        subjectCount++;
        displayedCount++;
      }
    }
    
    if (!hasResults) {
      message += `No results available yet.\n`;
    } else {
      const overallAvg = Math.round(totalPercentage / subjectCount);
      const gradeInfo = calculateGrade(overallAvg);
      message += `────────────────\n`;
      message += `AVG: ${overallAvg}% (${gradeInfo.desc})\n`;
    }
    
    message += `────────────────\n`;
    message += `Kalabo Secondary School`;
    
    if (message.length > 480) {
      message = message.substring(0, 450) + '...';
    }
    
    return message;
  } catch (error) {
    console.error('Error formatting message:', error);
    return `KALABO SEC SCHOOL\n${term} ${year} Results\n\nResults for ${studentId} are available.\nPlease contact the school.\n\nKalabo Secondary School`;
  }
}

async function resolveStudent(studentId) {
  try {
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
    
    const docRef = db.collection('learners').doc(studentId);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const data = docSnap.data();
      const customId = data.studentId || studentId;
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

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    firebase: admin.apps.length > 0 ? 'connected' : 'failed',
    smsConfigured: !!(credentials.apiKey && credentials.username),
    senderId: SENDER_ID
  });
});

app.get('/api/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await resolveStudent(studentId);
    
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    const rawPhone = student.data.guardianPhone || 
                     student.data.parentPhone || 
                     student.data.phone || 
                     student.data.contactNumber;
    
    const phoneValidation = rawPhone ? validateZambianNumber(rawPhone) : null;
    
    res.json({ 
      success: true,
      id: student.customId,
      documentId: student.documentId,
      name: student.data.fullName || student.data.name,
      hasGuardianPhone: !!rawPhone,
      phoneValid: !!phoneValidation,
      phoneCarrier: phoneValidation?.carrier || null,
      formattedPhone: phoneValidation?.number || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send-sms', async (req, res) => {
  try {
    const { studentId, term, year } = req.body;
    
    console.log(`\n📱 ===== SINGLE SMS REQUEST =====`);
    console.log(`   Student ID: ${studentId}`);
    console.log(`   Term/Year: ${term} ${year}`);
    
    if (!studentId || !term || !year) {
      return res.status(400).json({ success: false, error: 'Missing required fields: studentId, term, year' });
    }
    
    const student = await resolveStudent(studentId);
    if (!student) {
      return res.status(404).json({ success: false, error: `Student not found with ID: ${studentId}` });
    }
    
    const studentData = student.data;
    const studentName = studentData.fullName || studentData.name || 'Unknown';
    console.log(`   Student: ${studentName}`);
    
    const rawPhone = studentData.guardianPhone || 
                     studentData.parentPhone || 
                     studentData.phone || 
                     studentData.contactNumber;
    
    if (!rawPhone) {
      return res.status(400).json({ success: false, error: 'No guardian phone number on file', studentName });
    }
    
    const validated = validateZambianNumber(rawPhone);
    if (!validated) {
      return res.status(400).json({ success: false, error: `Invalid phone number: ${rawPhone}`, studentName, rawPhone });
    }
    
    console.log(`   Phone: ${validated.number} (${validated.carrier})`);
    
    let classData = null;
    if (studentData.classId) {
      const classDoc = await db.collection('classes').doc(studentData.classId).get();
      if (classDoc.exists) {
        classData = classDoc.data();
        console.log(`   Class: ${classData.name}`);
      }
    }
    
    const resultsCheck = await db.collection('results')
      .where('studentId', '==', student.documentId)
      .where('term', '==', term)
      .where('year', '==', year)
      .limit(1)
      .get();
    
    if (resultsCheck.empty) {
      return res.status(400).json({ success: false, error: 'No results available for this term/year', studentName });
    }
    
    const message = await formatSMSMessage(student.documentId, student.customId, term, year, studentData, classData);
    
    console.log(`   Message length: ${message.length} chars`);
    console.log(`   Message preview:`);
    console.log(message);
    
    // ==================== SEND SMS ====================
    if (!sms) {
      return res.status(500).json({ success: false, error: 'SMS service not initialized' });
    }
    
    let smsStatus = 'failed';
    let providerResponse = null;
    
    try {
      console.log(`   📤 Sending to Africa's Talking...`);
      
      const smsResult = await sms.send({
        to: validated.number,
        message: message,
        from: SENDER_ID
      });
      
      console.log(`   ✅ Africa's Talking response:`, JSON.stringify(smsResult).substring(0, 200));
      
      if (smsResult?.SMSMessageData?.Recipients?.length > 0) {
        const recipient = smsResult.SMSMessageData.Recipients[0];
        smsStatus = recipient.status === 'Success' ? 'sent' : 'failed';
        providerResponse = { status: recipient.status, messageId: recipient.messageId, cost: recipient.cost };
      } else {
        smsStatus = 'sent';
      }
      
    } catch (smsError) {
      console.error(`   ❌ Africa's Talking error:`, smsError.message);
      smsStatus = 'failed';
      providerResponse = { error: smsError.message };
      throw smsError;
    }
    
    await db.collection('sms_logs').add({
      studentId: student.customId,
      studentDocumentId: student.documentId,
      studentName,
      guardianPhone: validated.number,
      carrier: validated.carrier,
      term, year,
      message: message.substring(0, 500),
      status: smsStatus,
      providerResponse,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      endpoint: 'single'
    });
    
    console.log(`   ✅ SMS ${smsStatus === 'sent' ? 'sent successfully' : 'failed'}`);
    
    res.json({ 
      success: true, 
      message: smsStatus === 'sent' ? 'SMS sent successfully' : 'SMS may have failed',
      preview: message,
      phoneNumber: validated.number,
      carrier: validated.carrier,
      status: smsStatus
    });
    
  } catch (error) {
    console.error(`   ❌ Error:`, error.message);
    
    try {
      await db.collection('sms_logs').add({
        studentId: req.body.studentId || 'unknown',
        error: error.message,
        status: 'failed',
        attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        endpoint: 'single'
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    res.status(500).json({ success: false, error: error.message || 'Failed to send SMS' });
  }
});

app.post('/api/bulk-send', async (req, res) => {
  try {
    const { classId, term, year } = req.body;
    
    console.log(`\n📱 ===== BULK SMS REQUEST =====`);
    console.log(`   Class ID: ${classId}`);
    console.log(`   Term/Year: ${term} ${year}`);
    
    if (!classId || !term || !year) {
      return res.status(400).json({ success: false, error: 'Missing required fields: classId, term, year' });
    }
    
    if (!sms) {
      return res.status(500).json({ success: false, error: 'SMS service not initialized' });
    }
    
    const classDoc = await db.collection('classes').doc(classId).get();
    if (!classDoc.exists) {
      return res.status(404).json({ success: false, error: 'Class not found' });
    }
    const classData = classDoc.data();
    console.log(`   Class: ${classData.name}`);
    
    const studentsSnapshot = await db.collection('learners')
      .where('classId', '==', classId)
      .where('status', '==', 'active')
      .get();
    
    if (studentsSnapshot.empty) {
      return res.status(404).json({ success: false, error: 'No active students found in this class' });
    }
    
    console.log(`   Students: ${studentsSnapshot.size}`);
    
    const results = [];
    const failedList = [];
    let sentCount = 0;
    let skippedNoPhone = 0;
    let skippedNoResults = 0;
    
    for (const doc of studentsSnapshot.docs) {
      const studentData = doc.data();
      const studentDocumentId = doc.id;
      const customStudentId = studentData.studentId || studentDocumentId;
      const studentName = studentData.fullName || studentData.name || 'Unknown';
      
      console.log(`\n   ── ${studentName} (${customStudentId}) ──`);
      
      const rawPhone = studentData.guardianPhone || 
                       studentData.parentPhone || 
                       studentData.phone || 
                       studentData.contactNumber;
      
      if (!rawPhone) {
        console.log(`   ❌ No phone number`);
        failedList.push({ studentId: customStudentId, studentName, reason: 'No phone number' });
        skippedNoPhone++;
        continue;
      }
      
      const validated = validateZambianNumber(rawPhone);
      if (!validated) {
        console.log(`   ❌ Invalid phone: ${rawPhone}`);
        failedList.push({ studentId: customStudentId, studentName, reason: 'Invalid phone number' });
        continue;
      }
      
      console.log(`   📞 ${validated.number} (${validated.carrier})`);
      
      const resultsCheck = await db.collection('results')
        .where('studentId', '==', studentDocumentId)
        .where('term', '==', term)
        .where('year', '==', year)
        .limit(1)
        .get();
      
      if (resultsCheck.empty) {
        console.log(`   ❌ No results`);
        failedList.push({ studentId: customStudentId, studentName, reason: 'No results available' });
        skippedNoResults++;
        continue;
      }
      
      try {
        const message = await formatSMSMessage(studentDocumentId, customStudentId, term, year, studentData, classData);
        
        console.log(`   📤 Sending...`);
        
        const smsResult = await sms.send({
          to: validated.number,
          message: message,
          from: SENDER_ID
        });
        
        let smsStatus = 'sent';
        let providerResponse = null;
        
        if (smsResult?.SMSMessageData?.Recipients?.length > 0) {
          const recipient = smsResult.SMSMessageData.Recipients[0];
          smsStatus = recipient.status === 'Success' ? 'sent' : 'failed';
          providerResponse = { status: recipient.status, messageId: recipient.messageId, cost: recipient.cost };
        }
        
        if (smsStatus === 'sent') {
          sentCount++;
          console.log(`   ✅ Sent`);
        } else {
          console.log(`   ⚠️ Status: ${smsStatus}`);
        }
        
        results.push({ studentId: customStudentId, studentName, phoneNumber: validated.number, carrier: validated.carrier, status: smsStatus });
        
        await db.collection('sms_logs').add({
          studentId: customStudentId,
          studentDocumentId,
          studentName,
          guardianPhone: validated.number,
          carrier: validated.carrier,
          term, year,
          message: message.substring(0, 500),
          status: smsStatus,
          providerResponse,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          endpoint: 'bulk',
          classId
        });
        
      } catch (smsError) {
        console.log(`   ❌ Failed: ${smsError.message}`);
        failedList.push({ studentId: customStudentId, studentName, reason: smsError.message });
        
        await db.collection('sms_logs').add({
          studentId: customStudentId,
          studentDocumentId,
          studentName,
          guardianPhone: validated.number,
          carrier: validated.carrier,
          term, year,
          status: 'failed',
          error: smsError.message,
          attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
          endpoint: 'bulk',
          classId
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`\n   ═══════════════════════════════`);
    console.log(`   ✅ BULK COMPLETE`);
    console.log(`   Sent: ${sentCount}`);
    console.log(`   Failed: ${failedList.length}`);
    console.log(`   No Phone: ${skippedNoPhone}`);
    console.log(`   No Results: ${skippedNoResults}`);
    console.log(`   ═══════════════════════════════\n`);
    
    res.json({
      success: true,
      total: studentsSnapshot.size,
      sent: sentCount,
      failed: failedList.length,
      results,
      failedList,
      summary: { skippedNoPhone, skippedNoResults }
    });
    
  } catch (error) {
    console.error('❌ Bulk send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/sms-logs/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const logsSnapshot = await db.collection('sms_logs')
      .where('studentId', '==', studentId)
      .orderBy('sentAt', 'desc')
      .limit(10)
      .get();
    
    const logs = [];
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      logs.push({ id: doc.id, ...data, sentAt: data.sentAt?.toDate?.() || data.sentAt });
    });
    
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/sms-stats', async (req, res) => {
  try {
    const { days = '7' } = req.query;
    const daysNum = parseInt(days);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);
    
    const logsSnapshot = await db.collection('sms_logs')
      .where('sentAt', '>=', admin.firestore.Timestamp.fromDate(cutoffDate))
      .get();
    
    let total = 0, sent = 0, failed = 0;
    const carrierStats = {};
    
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      total++;
      
      if (data.status === 'sent' || data.status === 'Success') {
        sent++;
      } else {
        failed++;
      }
      
      const carrier = data.carrier || 'UNKNOWN';
      carrierStats[carrier] = (carrierStats[carrier] || 0) + 1;
    });
    
    res.json({
      success: true,
      period: `${daysNum} days`,
      total, sent, failed,
      successRate: total > 0 ? Math.round((sent / total) * 100) : 0,
      carrierStats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n═══════════════════════════════════════`);
  console.log(`✅ SMS Server running on http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📱 SMS Mode: ${credentials.apiKey ? 'LIVE' : 'NOT CONFIGURED'}`);
  console.log(`📤 Sender ID: ${SENDER_ID}`);
  console.log(`🌍 Phone validation: Zambia (260)`);
  console.log(`📡 Carriers: MTN, AIRTEL, ZAMTEL, ZedMobile`);
  console.log(`\n📝 Test commands:`);
  console.log(`   Health: curl http://localhost:${PORT}/api/health`);
  console.log(`   Send:   curl -X POST http://localhost:${PORT}/api/send-sms -H "Content-Type: application/json" -d '{"studentId":"G10B_001","term":"Term 1","year":2024}'`);
  console.log(`═══════════════════════════════════════\n`);
});