// @/pages/admin/AdminResultsAnalysis.tsx - FIXED VERSION
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo, useEffect } from 'react';
import { useResultsAnalytics } from '@/hooks/useResults';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  Filter,
  TrendingUp,
  TrendingDown,
  Printer, // Changed from Download to Printer
  BarChart3,
  PieChart,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  GraduationCap,
  Users,
  Target,
  School,
  BookOpen,
  Eye,
  FileText
} from 'lucide-react';

// ==================== TYPES ====================
interface GradeDistribution {
  grade: number;
  boys: number;
  girls: number;
  total: number;
  percentage: number;
  passStatus: 'distinction' | 'merit' | 'credit' | 'satisfactory' | 'fail';
}

interface ClassPerformance {
  classId: string;
  className: string;
  candidates: {
    boys: number;
    girls: number;
    total: number;
  };
  sat: {
    boys: number;
    girls: number;
    total: number;
  };
  gradeDistribution: GradeDistribution[];
  performance: {
    quality: {
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
    quantity: {
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
    fail: {
      boys: number;
      girls: number;
      total: number;
      percentage: number;
    };
  };
  subjectPerformance?: Array<{
    subject: string;
    teacher: string;
    quality: number;
    quantity: number;
    fail: number;
  }>;
}

interface SubjectPerformance {
  subject: string;
  teacher: string;
  classCount: number;
  studentCount: number;
  averageGrade: number;
  qualityRate: number;
  quantityRate: number;
  failRate: number;
}

// ==================== NOTIFICATION COMPONENT ====================
const Notification = ({ 
  type, 
  message, 
  description, 
  onClose 
}: { 
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  description?: string;
  onClose: () => void;
}) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    info: <AlertCircle className="w-5 h-5 text-blue-500" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500" />
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200'
  };

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-md w-full rounded-xl border p-4 shadow-lg animate-in slide-in-from-top-2 duration-300 ${bgColors[type]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {icons[type]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{message}</p>
          {description && (
            <p className="text-xs text-gray-600 mt-1">{description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-2 p-1 hover:bg-white/50 rounded-lg transition-colors"
        >
          <XCircle size={16} className="text-gray-400 hover:text-gray-600" />
        </button>
      </div>
    </div>
  );
};

// ==================== STAT CARD COMPONENT ====================
const StatCard = ({ 
  title, 
  value, 
  subValue, 
  icon: Icon, 
  trend,
  color = 'blue'
}: { 
  title: string;
  value: string;
  subValue: string;
  icon: React.ElementType;
  trend?: { value: string; direction: 'up' | 'down' | 'stable' };
  color?: 'blue' | 'green' | 'amber' | 'rose' | 'purple';
}) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200'
  };

  const trendColors = {
    up: 'text-green-600',
    down: 'text-rose-600',
    stable: 'text-gray-600'
  };

  return (
    <div className={`rounded-xl border p-5 ${colors[color]} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium opacity-80">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          <p className="text-xs mt-1 opacity-70">{subValue}</p>
        </div>
        <div className="p-3 bg-white/50 rounded-lg">
          <Icon size={24} className="opacity-80" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {trend.direction === 'up' && <TrendingUp size={14} className={trendColors.up} />}
          {trend.direction === 'down' && <TrendingDown size={14} className={trendColors.down} />}
          {trend.direction === 'stable' && <span className="w-3 h-3 rounded-full bg-gray-400"></span>}
          <span className={trendColors[trend.direction]}>{trend.value}</span>
          <span className="opacity-60">vs last term</span>
        </div>
      )}
    </div>
  );
};

// ==================== GRADE BADGE ====================
const GradeBadge = ({ grade, size = 'md', showLabel = false }: { grade: number; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean }) => {
  const getGradeInfo = (grade: number) => {
    if (grade <= 2) return { color: 'bg-emerald-500', label: 'Distinction' };
    if (grade <= 4) return { color: 'bg-blue-500', label: 'Merit' };
    if (grade <= 6) return { color: 'bg-amber-500', label: 'Credit' };
    if (grade <= 8) return { color: 'bg-orange-500', label: 'Satisfactory' };
    return { color: 'bg-rose-500', label: 'Fail' };
  };

  const { color, label } = getGradeInfo(grade);
  
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base'
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`${sizes[size]} ${color} text-white font-bold rounded-lg shadow-sm inline-block`}>
        {grade}
      </span>
      {showLabel && <span className="text-xs text-gray-600">{label}</span>}
    </div>
  );
};

// ==================== CLASS COMPARISON CHART ====================
const ClassComparisonChart = ({ data }: { data: ClassPerformance[] }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Class Performance Comparison</h3>
      
      <div className="space-y-4">
        {data.map((cls) => (
          <div key={cls.classId} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{cls.className}</span>
              <span className="text-xs text-gray-500">{cls.candidates.total} students</span>
            </div>
            
            {/* Stacked Bar */}
            <div className="flex h-8 rounded-lg overflow-hidden">
              {/* Quality Pass (1-6) */}
              <div 
                className="bg-emerald-500 flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${cls.performance.quality.percentage}%` }}
              >
                {cls.performance.quality.percentage > 8 && `${cls.performance.quality.percentage}%`}
              </div>
              
              {/* Quantity Only (7-8) */}
              <div 
                className="bg-orange-400 flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${cls.performance.quantity.percentage - cls.performance.quality.percentage}%` }}
              >
                {cls.performance.quantity.percentage - cls.performance.quality.percentage > 8 && 
                  `${cls.performance.quantity.percentage - cls.performance.quality.percentage}%`}
              </div>
              
              {/* Fail (9) */}
              <div 
                className="bg-rose-500 flex items-center justify-center text-xs text-white font-medium"
                style={{ width: `${cls.performance.fail.percentage}%` }}
              >
                {cls.performance.fail.percentage > 5 && `${cls.performance.fail.percentage}%`}
              </div>
            </div>
            
            {/* Legend for this row */}
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-500 rounded"></span>
                <span>Quality: {cls.performance.quality.percentage}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-orange-400 rounded"></span>
                <span>Pass: {cls.performance.quantity.percentage - cls.performance.quality.percentage}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 bg-rose-500 rounded"></span>
                <span>Fail: {cls.performance.fail.percentage}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== SUBJECT PERFORMANCE CHART ====================
const SubjectPerformanceChart = ({ data }: { data: SubjectPerformance[] }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Subject Performance Matrix</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.slice(0, 6).map((subject) => (
          <div key={subject.subject} className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-semibold text-gray-900">{subject.subject}</span>
                <span className="text-xs text-gray-500 ml-2">({subject.teacher})</span>
              </div>
              <span className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                {subject.classCount} classes
              </span>
            </div>
            
            {/* Three metrics in a row */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center p-2 bg-emerald-50 rounded-lg">
                <div className="text-xs text-gray-600">Quality</div>
                <div className="text-lg font-bold text-emerald-600">{subject.qualityRate}%</div>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded-lg">
                <div className="text-xs text-gray-600">Quantity</div>
                <div className="text-lg font-bold text-blue-600">{subject.quantityRate}%</div>
              </div>
              <div className="text-center p-2 bg-rose-50 rounded-lg">
                <div className="text-xs text-gray-600">Fail</div>
                <div className="text-lg font-bold text-rose-600">{subject.failRate}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== SKELETON COMPONENTS ====================
const MetricSkeleton = () => (
  <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
        <div className="h-8 bg-gray-300 rounded w-16"></div>
      </div>
      <div className="p-3 bg-gray-100 rounded-xl">
        <div className="w-6 h-6 bg-gray-300 rounded"></div>
      </div>
    </div>
    <div className="h-2 bg-gray-200 rounded w-32 mt-4"></div>
  </div>
);

const ChartSkeleton = () => (
  <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse">
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="h-5 bg-gray-200 rounded w-48 mb-2"></div>
        <div className="h-3 bg-gray-100 rounded w-64"></div>
      </div>
      <div className="h-9 bg-gray-200 rounded w-28"></div>
    </div>
    <div className="h-80 bg-gray-100 rounded-xl"></div>
  </div>
);

// ==================== PRINT PDF FUNCTION ====================
const generatePrintHTML = (data: {
  schoolName: string;
  term: string;
  year: number;
  selectedClass: string;
  schoolMetrics: any;
  gradeDistribution: GradeDistribution[];
  classPerformance: ClassPerformance[];
  subjectPerformance: SubjectPerformance[];
  generatedDate: string;
}) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>School Results - ${data.term} ${data.year}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: Arial, sans-serif;
          background: white;
          padding: 20px;
          color: #1e293b;
        }
        
        .print-container {
          max-width: 1200px;
          margin: 0 auto;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #2563eb;
        }
        
        .ministry {
          font-size: 16px;
          color: #475569;
          letter-spacing: 1px;
          margin-bottom: 5px;
        }
        
        .school-name {
          font-size: 28px;
          font-weight: bold;
          color: #0f172a;
          margin-bottom: 5px;
        }
        
        .report-title {
          font-size: 22px;
          color: #2563eb;
          font-weight: bold;
          margin-bottom: 10px;
        }
        
        .report-subtitle {
          font-size: 14px;
          color: #64748b;
        }
        
        .generated-date {
          font-size: 11px;
          color: #94a3b8;
          margin-top: 10px;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
          margin: 30px 0;
        }
        
        .stat-card {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 15px;
          text-align: center;
          background: #f8fafc;
        }
        
        .stat-label {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 5px;
        }
        
        .stat-value {
          font-size: 28px;
          font-weight: bold;
          margin: 5px 0;
        }
        
        .stat-value.blue { color: #2563eb; }
        .stat-value.green { color: #16a34a; }
        .stat-value.amber { color: #d97706; }
        .stat-value.red { color: #dc2626; }
        
        .stat-sub {
          font-size: 11px;
          color: #64748b;
        }
        
        h2 {
          font-size: 18px;
          margin: 30px 0 15px;
          color: #0f172a;
          border-left: 4px solid #2563eb;
          padding-left: 10px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
          font-size: 12px;
        }
        
        th {
          background: #1e293b;
          color: white;
          padding: 10px;
          text-align: center;
          font-weight: 600;
        }
        
        td {
          border: 1px solid #e2e8f0;
          padding: 8px;
          text-align: center;
        }
        
        tr:nth-child(even) {
          background: #f8fafc;
        }
        
        .grade-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          color: white;
          font-weight: bold;
          font-size: 11px;
        }
        
        .grade-1, .grade-2 { background: #10b981; }
        .grade-3, .grade-4 { background: #3b82f6; }
        .grade-5, .grade-6 { background: #f59e0b; }
        .grade-7, .grade-8 { background: #f97316; }
        .grade-9 { background: #ef4444; }
        
        .legend {
          display: flex;
          gap: 20px;
          margin: 15px 0;
          font-size: 11px;
          flex-wrap: wrap;
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 3px;
        }
        
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
          font-size: 10px;
          color: #94a3b8;
          text-align: center;
        }
        
        .signatures {
          display: flex;
          justify-content: space-between;
          margin: 40px 0 20px;
        }
        
        .signature-line {
          width: 200px;
          border-top: 1px solid #94a3b8;
          margin-bottom: 5px;
        }
        
        .signature-label {
          font-size: 11px;
          color: #64748b;
        }
        
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
        
        .text-left { text-align: left; }
        .font-bold { font-weight: bold; }
        .mt-20 { margin-top: 20px; }
        .mb-10 { margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <div class="print-container">
        
        <!-- Header -->
        <div class="header">
          <div class="ministry">MINISTRY OF EDUCATION</div>
          <div class="school-name">${data.schoolName}</div>
          <div class="report-title">SCHOOL RESULTS ANALYSIS REPORT</div>
          <div class="report-subtitle">${data.term} ${data.year} | ${data.selectedClass}</div>
          <div class="generated-date">Generated: ${data.generatedDate}</div>
        </div>

        <!-- Stats Cards -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Students</div>
            <div class="stat-value blue">${data.schoolMetrics.totalStudents}</div>
            <div class="stat-sub">${data.schoolMetrics.classesCount} classes</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Pass Rate</div>
            <div class="stat-value green">${data.schoolMetrics.passRate}%</div>
            <div class="stat-sub">${data.schoolMetrics.distinctionRate}% distinction</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Average Score</div>
            <div class="stat-value amber">${data.schoolMetrics.averageScore}%</div>
            <div class="stat-sub">mean performance</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Fail Rate</div>
            <div class="stat-value red">${data.schoolMetrics.failRate}%</div>
            <div class="stat-sub">Grade 9 students</div>
          </div>
        </div>

        <!-- Grade Distribution -->
        <h2>Grade Distribution</h2>
        
        <table>
          <thead>
            <tr>
              <th>Grade</th>
              <th>Status</th>
              <th>Boys</th>
              <th>Girls</th>
              <th>Total</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            ${data.gradeDistribution.map(g => {
              const status = g.grade <= 2 ? 'Distinction' : 
                            g.grade <= 4 ? 'Merit' : 
                            g.grade <= 6 ? 'Credit' : 
                            g.grade <= 8 ? 'Satisfactory' : 'Fail';
              return `
                <tr>
                  <td><span class="grade-badge grade-${g.grade}">${g.grade}</span></td>
                  <td>${status}</td>
                  <td>${g.boys}</td>
                  <td>${g.girls}</td>
                  <td class="font-bold">${g.total}</td>
                  <td>${g.percentage}%</td>
                </tr>
              `;
            }).join('')}
            <tr style="background: #f1f5f9; font-weight: bold;">
              <td colspan="2">TOTAL</td>
              <td>${data.gradeDistribution.reduce((sum, g) => sum + g.boys, 0)}</td>
              <td>${data.gradeDistribution.reduce((sum, g) => sum + g.girls, 0)}</td>
              <td>${data.gradeDistribution.reduce((sum, g) => sum + g.total, 0)}</td>
              <td>100%</td>
            </tr>
          </tbody>
        </table>

        <!-- Legend -->
        <div class="legend">
          <div class="legend-item"><span class="legend-color" style="background: #10b981;"></span> Distinction (1-2)</div>
          <div class="legend-item"><span class="legend-color" style="background: #3b82f6;"></span> Merit (3-4)</div>
          <div class="legend-item"><span class="legend-color" style="background: #f59e0b;"></span> Credit (5-6)</div>
          <div class="legend-item"><span class="legend-color" style="background: #f97316;"></span> Satisfactory (7-8)</div>
          <div class="legend-item"><span class="legend-color" style="background: #ef4444;"></span> Fail (9)</div>
        </div>

        <!-- Class Performance -->
        <h2>Class Performance Summary</h2>
        
        <table>
          <thead>
            <tr>
              <th>Class</th>
              <th>Students</th>
              <th>Boys/Girls</th>
              <th>Quality</th>
              <th>Quantity</th>
              <th>Fail</th>
              <th>Top Grade</th>
            </tr>
          </thead>
          <tbody>
            ${data.classPerformance.slice(0, 10).map(cls => {
              const topGrade = cls.gradeDistribution.length > 0 
                ? cls.gradeDistribution.reduce((min, g) => g.grade < min.grade ? g : min).grade
                : 9;
              return `
                <tr>
                  <td class="text-left font-bold">${cls.className}</td>
                  <td>${cls.candidates.total}</td>
                  <td>${cls.candidates.boys}/${cls.candidates.girls}</td>
                  <td style="color: #16a34a;">${cls.performance.quality.percentage}%</td>
                  <td style="color: #2563eb;">${cls.performance.quantity.percentage}%</td>
                  <td style="color: #dc2626;">${cls.performance.fail.percentage}%</td>
                  <td><span class="grade-badge grade-${topGrade}">${topGrade}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- Subject Performance -->
        <h2>Subject Performance Analysis</h2>
        
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Teacher</th>
              <th>Classes</th>
              <th>Students</th>
              <th>Avg Grade</th>
              <th>Quality</th>
              <th>Quantity</th>
              <th>Fail</th>
            </tr>
          </thead>
          <tbody>
            ${data.subjectPerformance.slice(0, 15).map(sub => `
              <tr>
                <td class="text-left">${sub.subject}</td>
                <td class="text-left">${sub.teacher}</td>
                <td>${sub.classCount}</td>
                <td>${sub.studentCount}</td>
                <td>${sub.averageGrade}</td>
                <td style="color: #16a34a; font-weight: bold;">${sub.qualityRate}%</td>
                <td style="color: #2563eb; font-weight: bold;">${sub.quantityRate}%</td>
                <td style="color: #dc2626; font-weight: bold;">${sub.failRate}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Key Insights -->
        <h2>Key Insights</h2>
        
        <table>
          <tbody>
            <tr>
              <td class="text-left" style="width: 30%;">Top Performing Subjects</td>
              <td class="text-left">${data.subjectPerformance.sort((a, b) => b.qualityRate - a.qualityRate).slice(0, 3).map(s => s.subject).join(', ')}</td>
            </tr>
            <tr>
              <td class="text-left">Subjects Needing Attention</td>
              <td class="text-left">${data.subjectPerformance.filter(s => s.failRate > 15).map(s => s.subject).join(', ') || 'None'}</td>
            </tr>
            <tr>
              <td class="text-left">Overall Pass Rate</td>
              <td class="text-left">${data.schoolMetrics.passRate}% (Target: 70%)</td>
            </tr>
            <tr>
              <td class="text-left">Total Assessments</td>
              <td class="text-left">${data.schoolMetrics.totalAssessments}</td>
            </tr>
          </tbody>
        </table>

        <!-- Recommendations -->
        <h2>Recommendations</h2>
        
        <table>
          <tbody>
            <tr>
              <td class="text-left" style="color: ${data.schoolMetrics.passRate >= 70 ? '#16a34a' : '#dc2626'};">
                ${data.schoolMetrics.passRate >= 70 
                  ? '✓ Pass rate target met. Maintain current teaching strategies.'
                  : '! Pass rate below target. Consider intervention programs for struggling students.'}
              </td>
            </tr>
            ${data.subjectPerformance.filter(s => s.failRate > 15).length > 0 ? `
              <tr>
                <td class="text-left" style="color: #f97316;">
                  ! Review teaching approaches for: ${data.subjectPerformance.filter(s => s.failRate > 15).map(s => s.subject).join(', ')}
                </td>
              </tr>
            ` : ''}
            <tr>
              <td class="text-left">• Schedule parent-teacher meetings for students with Grade 9</td>
            </tr>
            <tr>
              <td class="text-left">• Conduct department meetings to share best practices</td>
            </tr>
          </tbody>
        </table>

        <!-- Signatures -->
        <div class="signatures">
          <div>
            <div class="signature-line"></div>
            <div class="signature-label">Head Teacher</div>
            <div class="signature-label">Date: _______________</div>
          </div>
          <div>
            <div class="signature-line"></div>
            <div class="signature-label">Academic Coordinator</div>
            <div class="signature-label">Date: _______________</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>Total Assessments: ${data.schoolMetrics.totalAssessments} • Generated: ${data.generatedDate}</p>
          <p>This is a computer-generated report. No signature is required.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ==================== MAIN COMPONENT ====================
export default function AdminResultsAnalysis() {
  const { user } = useAuth();
  const isUserAdmin = user?.userType === 'admin';
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // State for notifications
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
    description?: string;
  }>>([]);

  // State for filters
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Get classes for filter
  const { classes, isLoading: classesLoading } = useSchoolClasses({ isActive: true });

  // Get all learners for gender data
  const { learners, isLoading: learnersLoading } = useSchoolLearners();

  // Use the analytics hook with real data
  const { 
    analytics, 
    results, 
    isLoading, 
    isFetching, 
    refetch 
  } = useResultsAnalytics({
    classId: selectedClass !== 'all' ? selectedClass : undefined,
    term: selectedTerm,
    year: selectedYear,
  });

  // Create a map of studentId -> gender for quick lookup
  const studentGenderMap = useMemo(() => {
    const map = new Map<string, 'M' | 'F'>();
    learners.forEach(learner => {
      if (learner.gender) {
        map.set(learner.studentId, learner.gender === 'male' ? 'M' : 'F');
      }
    });
    return map;
  }, [learners]);

  // Notification helper
  const showNotification = (
    type: 'success' | 'error' | 'info' | 'warning',
    message: string,
    description?: string
  ) => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, type, message, description }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Calculate grade distribution with gender breakdown
  const gradeDistribution = useMemo((): GradeDistribution[] => {
    if (!results || results.length === 0) return [];

    const endOfTermResults = results.filter(r => 
      r.examType === 'endOfTerm' && r.grade > 0
    );

    if (endOfTermResults.length === 0) return [];

    const gradeMap = new Map<number, { boys: number; girls: number }>();
    
    // Initialize grades 1-9
    for (let i = 1; i <= 9; i++) {
      gradeMap.set(i, { boys: 0, girls: 0 });
    }

    // Count boys and girls per grade using the studentGenderMap
    endOfTermResults.forEach(result => {
      const current = gradeMap.get(result.grade) || { boys: 0, girls: 0 };
      const gender = studentGenderMap.get(result.studentId);
      
      if (gender === 'M') {
        gradeMap.set(result.grade, { ...current, boys: current.boys + 1 });
      } else if (gender === 'F') {
        gradeMap.set(result.grade, { ...current, girls: current.girls + 1 });
      }
    });

    const total = endOfTermResults.length;

    const getPassStatus = (grade: number): 'distinction' | 'merit' | 'credit' | 'satisfactory' | 'fail' => {
      if (grade <= 2) return 'distinction';
      if (grade <= 4) return 'merit';
      if (grade <= 6) return 'credit';
      if (grade <= 8) return 'satisfactory';
      return 'fail';
    };

    return Array.from(gradeMap.entries())
      .map(([grade, counts]) => ({
        grade,
        boys: counts.boys,
        girls: counts.girls,
        total: counts.boys + counts.girls,
        percentage: total > 0 ? Math.round(((counts.boys + counts.girls) / total) * 100) : 0,
        passStatus: getPassStatus(grade)
      }))
      .filter(g => g.total > 0);
  }, [results, studentGenderMap]);

  // Calculate school-wide metrics
  const schoolMetrics = useMemo(() => {
    if (!analytics || !results) {
      return {
        totalStudents: 0,
        totalAssessments: 0,
        averageScore: 0,
        passRate: 0,
        failRate: 0,
        distinctionRate: 0,
        classesCount: classes?.length || 0,
        subjectsCount: 0
      };
    }

    const endOfTermResults = results.filter(r => r.examType === 'endOfTerm');
    const totalAssessments = endOfTermResults.length;
    
    const distinctionCount = endOfTermResults.filter(r => r.grade <= 2).length;
    const passCount = endOfTermResults.filter(r => r.grade <= 6).length;
    const failCount = endOfTermResults.filter(r => r.grade >= 7).length;
    
    const uniqueStudents = new Set(endOfTermResults.map(r => r.studentId)).size;
    const uniqueSubjects = new Set(endOfTermResults.map(r => r.subjectId)).size;

    return {
      totalStudents: uniqueStudents,
      totalAssessments,
      averageScore: analytics.averagePercentage || 0,
      passRate: totalAssessments > 0 ? Math.round((passCount / totalAssessments) * 100) : 0,
      failRate: totalAssessments > 0 ? Math.round((failCount / totalAssessments) * 100) : 0,
      distinctionRate: totalAssessments > 0 ? Math.round((distinctionCount / totalAssessments) * 100) : 0,
      classesCount: classes?.length || 0,
      subjectsCount: uniqueSubjects
    };
  }, [analytics, results, classes]);

  // Calculate class-level performance
  const classPerformance = useMemo((): ClassPerformance[] => {
    if (!results || results.length === 0 || !classes) return [];

    // Group results by class
    const classMap = new Map<string, typeof results>();
    
    results.forEach(result => {
      if (!classMap.has(result.classId)) {
        classMap.set(result.classId, []);
      }
      classMap.get(result.classId)!.push(result);
    });

    return Array.from(classMap.entries()).map(([classId, classResults]) => {
      const endOfTermResults = classResults.filter(r => r.examType === 'endOfTerm' && r.grade > 0);
      const total = endOfTermResults.length;

      // Grade distribution for this class
      const gradeMap = new Map<number, { boys: number; girls: number }>();
      for (let i = 1; i <= 9; i++) gradeMap.set(i, { boys: 0, girls: 0 });
      
      endOfTermResults.forEach(result => {
        const current = gradeMap.get(result.grade)!;
        const gender = studentGenderMap.get(result.studentId);
        
        if (gender === 'M') {
          gradeMap.set(result.grade, { ...current, boys: current.boys + 1 });
        } else if (gender === 'F') {
          gradeMap.set(result.grade, { ...current, girls: current.girls + 1 });
        }
      });

      const gradeDistribution = Array.from(gradeMap.entries())
        .map(([grade, counts]) => {
          let passStatus: 'distinction' | 'merit' | 'credit' | 'satisfactory' | 'fail';
          if (grade <= 2) passStatus = 'distinction';
          else if (grade <= 4) passStatus = 'merit';
          else if (grade <= 6) passStatus = 'credit';
          else if (grade <= 8) passStatus = 'satisfactory';
          else passStatus = 'fail';
          
          return {
            grade,
            boys: counts.boys,
            girls: counts.girls,
            total: counts.boys + counts.girls,
            percentage: total > 0 ? Math.round(((counts.boys + counts.girls) / total) * 100) : 0,
            passStatus
          };
        })
        .filter(g => g.total > 0);

      // Performance metrics with gender breakdown
      const qualityBoys = endOfTermResults.filter(r => 
        r.grade <= 6 && studentGenderMap.get(r.studentId) === 'M'
      ).length;
      
      const qualityGirls = endOfTermResults.filter(r => 
        r.grade <= 6 && studentGenderMap.get(r.studentId) === 'F'
      ).length;
      
      const quantityBoys = endOfTermResults.filter(r => 
        r.grade <= 8 && studentGenderMap.get(r.studentId) === 'M'
      ).length;
      
      const quantityGirls = endOfTermResults.filter(r => 
        r.grade <= 8 && studentGenderMap.get(r.studentId) === 'F'
      ).length;
      
      const failBoys = endOfTermResults.filter(r => 
        r.grade === 9 && studentGenderMap.get(r.studentId) === 'M'
      ).length;
      
      const failGirls = endOfTermResults.filter(r => 
        r.grade === 9 && studentGenderMap.get(r.studentId) === 'F'
      ).length;

      const qualityCount = endOfTermResults.filter(r => r.grade <= 6).length;
      const quantityCount = endOfTermResults.filter(r => r.grade <= 8).length;
      const failCount = endOfTermResults.filter(r => r.grade === 9).length;

      // Subject performance for this class
      const subjectMap = new Map<string, { teacher: string; grades: number[] }>();
      endOfTermResults.forEach(r => {
        const subjectKey = r.subjectId || 'Unknown';
        if (!subjectMap.has(subjectKey)) {
          subjectMap.set(subjectKey, { teacher: r.teacherName || 'Unknown', grades: [] });
        }
        subjectMap.get(subjectKey)!.grades.push(r.grade);
      });

      const subjectPerformance = Array.from(subjectMap.entries()).map(([subject, data]) => {
        const total = data.grades.length;
        const quality = data.grades.filter(g => g <= 6).length;
        const quantity = data.grades.filter(g => g <= 8).length;
        const fail = data.grades.filter(g => g === 9).length;

        return {
          subject,
          teacher: data.teacher,
          quality: Math.round((quality / total) * 100),
          quantity: Math.round((quantity / total) * 100),
          fail: Math.round((fail / total) * 100)
        };
      });

      const className = classes.find(c => c.id === classId)?.name || classId;

      return {
        classId,
        className,
        candidates: {
          boys: qualityBoys + quantityBoys + failBoys,
          girls: qualityGirls + quantityGirls + failGirls,
          total: endOfTermResults.length
        },
        sat: {
          boys: endOfTermResults.filter(r => studentGenderMap.get(r.studentId) === 'M').length,
          girls: endOfTermResults.filter(r => studentGenderMap.get(r.studentId) === 'F').length,
          total: endOfTermResults.length
        },
        gradeDistribution,
        performance: {
          quality: {
            boys: qualityBoys,
            girls: qualityGirls,
            total: qualityCount,
            percentage: total > 0 ? Math.round((qualityCount / total) * 100) : 0
          },
          quantity: {
            boys: quantityBoys,
            girls: quantityGirls,
            total: quantityCount,
            percentage: total > 0 ? Math.round((quantityCount / total) * 100) : 0
          },
          fail: {
            boys: failBoys,
            girls: failGirls,
            total: failCount,
            percentage: total > 0 ? Math.round((failCount / total) * 100) : 0
          }
        },
        subjectPerformance
      };
    });
  }, [results, classes, studentGenderMap]);

  // Calculate subject performance across school
  const subjectPerformance = useMemo((): SubjectPerformance[] => {
    if (!results || results.length === 0) return [];

    const subjectMap = new Map<string, {
      teacher: string;
      classes: Set<string>;
      students: Set<string>;
      grades: number[];
    }>();

    results.filter(r => r.examType === 'endOfTerm' && r.grade > 0).forEach(result => {
      const subjectKey = result.subjectId || 'Unknown';
      if (!subjectMap.has(subjectKey)) {
        subjectMap.set(subjectKey, {
          teacher: result.teacherName || 'Unknown',
          classes: new Set(),
          students: new Set(),
          grades: []
        });
      }
      const data = subjectMap.get(subjectKey)!;
      data.classes.add(result.classId);
      data.students.add(result.studentId);
      data.grades.push(result.grade);
    });

    return Array.from(subjectMap.entries()).map(([subject, data]) => {
      const total = data.grades.length;
      const quality = data.grades.filter(g => g <= 6).length;
      const quantity = data.grades.filter(g => g <= 8).length;
      const fail = data.grades.filter(g => g === 9).length;
      const averageGrade = data.grades.reduce((sum, g) => sum + g, 0) / total;

      return {
        subject,
        teacher: data.teacher,
        classCount: data.classes.size,
        studentCount: data.students.size,
        averageGrade: Math.round(averageGrade * 10) / 10,
        qualityRate: Math.round((quality / total) * 100),
        quantityRate: Math.round((quantity / total) * 100),
        failRate: Math.round((fail / total) * 100)
      };
    }).sort((a, b) => a.failRate - b.failRate);
  }, [results]);

  // ==================== NEW PRINT FUNCTION (REPLACES PDF EXPORT) ====================
  const handlePrintPDF = () => {
    try {
      if (!results || results.length === 0) {
        showNotification(
          'warning',
          'No data to export',
          'There are no results available for the selected filters.'
        );
        return;
      }

      setIsPrinting(true);
      
      showNotification(
        'info',
        'Preparing print view...',
        'The print dialog will open in a moment.'
      );

      // Prepare data for print
      const printData = {
        schoolName: 'Kalabo Boarding Secondary School',
        term: selectedTerm,
        year: selectedYear,
        selectedClass: selectedClass !== 'all' 
          ? classes?.find(c => c.id === selectedClass)?.name || selectedClass
          : 'All Classes',
        schoolMetrics,
        gradeDistribution,
        classPerformance,
        subjectPerformance,
        generatedDate: new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      };

      // Generate HTML content
      const printHTML = generatePrintHTML(printData);

      // Open print window
      const printWindow = window.open('', '_blank');
      
      if (!printWindow) {
        showNotification(
          'error',
          'Pop-up blocked',
          'Please allow pop-ups for this site to print.'
        );
        setIsPrinting(false);
        return;
      }

      // Write content to new window
      printWindow.document.write(printHTML);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.onafterprint = () => {
            printWindow.close();
          };
          setIsPrinting(false);
        }, 500);
      };

      showNotification(
        'success',
        'Print view ready',
        'Use "Save as PDF" in the print dialog.'
      );

    } catch (error) {
      console.error('Print Error:', error);
      showNotification(
        'error',
        'Print Failed',
        'An error occurred while preparing the print view.'
      );
      setIsPrinting(false);
    }
  };

  // Handle filter change
  const handleFilterChange = (type: 'class' | 'term' | 'year', value: string | number) => {
    if (type === 'class') setSelectedClass(value as string);
    if (type === 'term') setSelectedTerm(value as string);
    if (type === 'year') setSelectedYear(value as number);
    
    showNotification(
      'info',
      'Updating results...',
      `Showing data for ${type === 'class' ? (value === 'all' ? 'all classes' : value) : selectedTerm}`
    );
  };

  // Handle refresh
  const handleRefresh = async () => {
    showNotification(
      'info',
      'Refreshing data...',
      'Fetching the latest results.'
    );
    await refetch();
    showNotification(
      'success',
      'Data updated',
      'Results are now current.'
    );
  };

  // Years for filter (2026 onwards)
  const currentYear = new Date().getFullYear();
  const years = [2026, 2027, 2028, 2029, 2030];

  // Loading states
  if (isLoading || classesLoading || learnersLoading) {
    return (
      <DashboardLayout activeTab="results">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-64"></div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-32 bg-gray-100 rounded-xl"></div>
              ))}
            </div>
            <div className="h-96 bg-gray-100 rounded-xl"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="results">
      <div className="min-h-screen bg-gray-50 p-3 sm:p-6 lg:p-8 transition-all duration-200">
        
        {/* Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <Notification
              key={notification.id}
              type={notification.type}
              message={notification.message}
              description={notification.description}
              onClose={() => removeNotification(notification.id)}
            />
          ))}
        </div>

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                School Results Analysis
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1 sm:mt-2 flex items-center gap-2 flex-wrap">
                <School size={16} className="text-gray-400" />
                <span>End of Term Performance • {selectedTerm} {selectedYear}</span>
                {isFetching && (
                  <span className="inline-flex items-center gap-1.5 text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full text-xs">
                    <Loader2 size={12} className="animate-spin" />
                    updating
                  </span>
                )}
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrintPDF}
                disabled={results.length === 0 || isFetching || isPrinting}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPrinting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Printer size={18} />
                )}
                <span className={isMobile ? 'hidden sm:inline' : ''}>
                  {isPrinting ? 'Preparing...' : 'Print / Save PDF'}
                </span>
              </button>
              
              <button
                onClick={handleRefresh}
                disabled={isFetching}
                className="p-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* School Overview Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <StatCard
            title="Total Students"
            value={schoolMetrics.totalStudents.toString()}
            subValue={`Across ${schoolMetrics.classesCount} classes`}
            icon={Users}
            color="blue"
          />
          <StatCard
            title="Pass Rate"
            value={`${schoolMetrics.passRate}%`}
            subValue={`${schoolMetrics.distinctionRate}% distinction`}
            icon={Target}
            color="green"
          />
          <StatCard
            title="Average Score"
            value={`${schoolMetrics.averageScore}%`}
            subValue="Mean performance"
            icon={GraduationCap}
            color="amber"
          />
          <StatCard
            title="Fail Rate"
            value={`${schoolMetrics.failRate}%`}
            subValue="Grade 9 students"
            icon={AlertCircle}
            color="rose"
          />
        </div>

        {/* Filters */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            
            {/* Mobile Filter Toggle */}
            {isMobile && (
              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-full flex items-center justify-between p-4 bg-white"
              >
                <div className="flex items-center gap-2">
                  <Filter size={18} className="text-gray-400" />
                  <span className="font-medium text-gray-700">
                    {selectedClass !== 'all' ? `Class: ${selectedClass}` : 'Filter by class'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedClass !== 'all' && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  )}
                  <ChevronDown 
                    size={18} 
                    className={`text-gray-500 transition-transform duration-200 ${showMobileFilters ? 'rotate-180' : ''}`} 
                  />
                </div>
              </button>
            )}

            {/* Filter Content */}
            <div className={`p-4 sm:p-6 ${isMobile && !showMobileFilters ? 'hidden' : 'block'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Filter size={16} className="text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Filter by:</span>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 flex-1">
                  {/* Class Filter */}
                  <div className="relative flex-1">
                    <select
                      value={selectedClass}
                      onChange={(e) => handleFilterChange('class', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               appearance-none bg-white cursor-pointer text-sm
                               hover:border-gray-400 transition-colors"
                    >
                      <option value="all">All Classes</option>
                      {classes.map(cls => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name} • Year {cls.year} • {cls.students} students
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>

                  {/* Term Filter */}
                  <div className="relative sm:w-40">
                    <select
                      value={selectedTerm}
                      onChange={(e) => handleFilterChange('term', e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               appearance-none bg-white cursor-pointer text-sm"
                    >
                      <option value="Term 1">Term 1</option>
                      <option value="Term 2">Term 2</option>
                      <option value="Term 3">Term 3</option>
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>

                  {/* Year Filter */}
                  <div className="relative sm:w-32">
                    <select
                      value={selectedYear}
                      onChange={(e) => handleFilterChange('year', Number(e.target.value))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                               appearance-none bg-white cursor-pointer text-sm"
                    >
                      {years.map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <ChevronDown size={16} className="text-gray-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Filter Indicator */}
              {selectedClass !== 'all' && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Currently showing:</span>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                      <Filter size={12} />
                      {classes.find(c => c.id === selectedClass)?.name || selectedClass}
                    </span>
                    <button
                      onClick={() => handleFilterChange('class', 'all')}
                      className="text-xs text-gray-500 hover:text-gray-700 hover:underline ml-1"
                    >
                      Clear filter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        {results.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
              <FileText className="text-gray-400" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Results Available</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              {selectedClass !== 'all' 
                ? `No end of term results found for ${classes.find(c => c.id === selectedClass)?.name}.`
                : 'No end of term results have been entered yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Grade Distribution Chart */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <BarChart3 size={18} className="text-blue-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">
                      School Grade Distribution
                    </h3>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Overall performance across all grades (1-9) with gender breakdown
                  </p>
                </div>
                
                {/* Legend */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-blue-500 rounded"></span>
                    <span className="text-xs">Boys</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-rose-500 rounded"></span>
                    <span className="text-xs">Girls</span>
                  </div>
                </div>
              </div>

              {/* Bar Chart */}
              <div className="h-80 relative">
                {/* Y-axis labels */}
                <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between text-xs text-gray-500">
                  <span>{Math.max(...gradeDistribution.map(g => g.total))}</span>
                  <span>{Math.round(Math.max(...gradeDistribution.map(g => g.total)) * 0.75)}</span>
                  <span>{Math.round(Math.max(...gradeDistribution.map(g => g.total)) * 0.5)}</span>
                  <span>{Math.round(Math.max(...gradeDistribution.map(g => g.total)) * 0.25)}</span>
                  <span>0</span>
                </div>

                {/* Bars container */}
                <div className="absolute left-16 right-0 top-0 bottom-0">
                  <div className="flex items-end justify-around h-full">
                    {gradeDistribution.map((grade) => (
                      <div key={grade.grade} className="flex flex-col items-center w-16">
                        {/* Bars */}
                        <div className="flex gap-1 w-full justify-center mb-2">
                          {/* Boys Bar */}
                          {grade.boys > 0 && (
                            <div className="flex flex-col items-center group">
                              <div className="relative">
                                <div 
                                  className="w-6 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                                  style={{ height: `${(grade.boys / Math.max(...gradeDistribution.map(g => g.total))) * 200}px`, minHeight: '4px' }}
                                />
                                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                  Boys: {grade.boys}
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Girls Bar */}
                          {grade.girls > 0 && (
                            <div className="flex flex-col items-center group">
                              <div className="relative">
                                <div 
                                  className="w-6 bg-rose-500 rounded-t transition-all duration-500 hover:bg-rose-600"
                                  style={{ height: `${(grade.girls / Math.max(...gradeDistribution.map(g => g.total))) * 200}px`, minHeight: '4px' }}
                                />
                                <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                                  Girls: {grade.girls}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Grade Label */}
                        <GradeBadge grade={grade.grade} size="sm" />
                        
                        {/* Percentage */}
                        <span className="text-xs text-gray-500 mt-1">
                          {grade.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Grid lines */}
                  <div className="absolute inset-0 pointer-events-none">
                    {[0, 25, 50, 75, 100].map((val, i) => (
                      <div 
                        key={i}
                        className="absolute left-0 right-0 border-t border-gray-100"
                        style={{ bottom: `${val}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Chart Footer */}
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Total Students:</span>
                    <span className="text-lg font-bold text-gray-900">
                      {gradeDistribution.reduce((sum, g) => sum + g.total, 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Boys:</span>
                    <span className="text-lg font-bold text-blue-600">
                      {gradeDistribution.reduce((sum, g) => sum + g.boys, 0)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Girls:</span>
                    <span className="text-lg font-bold text-rose-600">
                      {gradeDistribution.reduce((sum, g) => sum + g.girls, 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Class Comparison Chart */}
            {classPerformance.length > 0 && (
              <ClassComparisonChart data={classPerformance} />
            )}

            {/* Subject Performance */}
            {subjectPerformance.length > 0 && (
              <SubjectPerformanceChart data={subjectPerformance} />
            )}

            {/* Quick Stats Table */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">Class Performance Summary</h3>
                <p className="text-sm text-gray-500 mt-0.5">Quick overview of all classes</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Class</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Students</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Boys/Girls</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Quality</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Quantity</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Fail</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Top Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {classPerformance.slice(0, 5).map((cls) => {
                      const topGrade = cls.gradeDistribution.length > 0 
                        ? cls.gradeDistribution.reduce((min, g) => g.grade < min.grade ? g : min).grade
                        : 9;
                      
                      return (
                        <tr key={cls.classId} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{cls.className}</td>
                          <td className="px-6 py-4 text-sm text-gray-700">{cls.candidates.total}</td>
                          <td className="px-6 py-4 text-sm">
                            <span className="text-blue-600 font-medium">{cls.candidates.boys}</span>
                            <span className="text-gray-400 mx-1">/</span>
                            <span className="text-rose-600 font-medium">{cls.candidates.girls}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-semibold ${
                              cls.performance.quality.percentage >= 70 ? 'text-green-600' :
                              cls.performance.quality.percentage >= 50 ? 'text-amber-600' : 'text-rose-600'
                            }`}>
                              {cls.performance.quality.percentage}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-blue-600">
                              {cls.performance.quantity.percentage}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-sm font-semibold ${
                              cls.performance.fail.percentage <= 5 ? 'text-green-600' :
                              cls.performance.fail.percentage <= 10 ? 'text-amber-600' : 'text-rose-600'
                            }`}>
                              {cls.performance.fail.percentage}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <GradeBadge grade={topGrade} size="sm" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-xs sm:text-sm text-gray-500">
              {results.length > 0 ? (
                <>
                  <span className="font-medium">Data source:</span> End of Term Results • 
                  <span className="font-medium ml-1">Last updated:</span> Just now •
                  <span className="font-medium ml-1">Total assessments:</span> {schoolMetrics.totalAssessments}
                </>
              ) : (
                'No results data available for the current selection'
              )}
            </p>
            <button 
              onClick={() => refetch()}
              className="text-xs sm:text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              Refresh data
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}