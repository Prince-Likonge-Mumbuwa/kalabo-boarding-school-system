import { DashboardLayout } from '@/components/DashboardLayout';
import { useState } from 'react';
import { Plus, Trash2, Edit2, Mail, BookOpen } from 'lucide-react';

interface Teacher {
  id: string;
  name: string;
  email: string;
  subjects: string[];
  classesAssigned: number;
  joinDate: string;
}

export default function TeacherManagement() {
  const [teachers, setTeachers] = useState<Teacher[]>([
    { id: '1', name: 'Mr. Johnson', email: 'johnson@school.edu', subjects: ['Mathematics'], classesAssigned: 2, joinDate: '2023-01-15' },
    { id: '2', name: 'Mrs. Smith', email: 'smith@school.edu', subjects: ['English', 'Literature'], classesAssigned: 2, joinDate: '2023-02-01' },
    { id: '3', name: 'Mr. Banda', email: 'banda@school.edu', subjects: ['Science', 'Biology'], classesAssigned: 2, joinDate: '2023-01-20' },
    { id: '4', name: 'Ms. Chileshe', email: 'chileshe@school.edu', subjects: ['History', 'Geography'], classesAssigned: 2, joinDate: '2023-03-10' },
    { id: '5', name: 'Mr. Phiri', email: 'phiri@school.edu', subjects: ['Chemistry'], classesAssigned: 1, joinDate: '2023-04-05' },
    { id: '6', name: 'Miss Mulenga', email: 'mulenga@school.edu', subjects: ['Physics', 'Mathematics'], classesAssigned: 2, joinDate: '2023-02-15' },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', subjects: '' });

  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.email && formData.subjects) {
      const newTeacher: Teacher = {
        id: Date.now().toString(),
        name: formData.name,
        email: formData.email,
        subjects: formData.subjects.split(',').map(s => s.trim()),
        classesAssigned: 0,
        joinDate: new Date().toISOString().split('T')[0],
      };
      setTeachers([...teachers, newTeacher]);
      setFormData({ name: '', email: '', subjects: '' });
      setShowForm(false);
    }
  };

  const handleDeleteTeacher = (id: string) => {
    setTeachers(teachers.filter(t => t.id !== id));
  };

  return (
    <DashboardLayout activeTab="teachers">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Teacher Management</h1>
            <p className="text-gray-600 mt-1">Manage teachers and assign them to classes</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus size={20} />
            Add Teacher
          </button>
        </div>

        {/* Add Teacher Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Register New Teacher</h2>
            <form onSubmit={handleAddTeacher} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Full Name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="email"
                placeholder="Email Address"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="text"
                placeholder="Subjects (comma-separated)"
                value={formData.subjects}
                onChange={e => setFormData({ ...formData, subjects: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                className="col-span-1 sm:col-span-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Add Teacher
              </button>
            </form>
          </div>
        )}

        {/* Teachers Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Email</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Subjects</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Classes</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Joined</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{teacher.name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail size={16} />
                        {teacher.email}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {teacher.subjects.map((subject, idx) => (
                          <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                            {subject}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-600">
                        <BookOpen size={16} />
                        {teacher.classesAssigned}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{teacher.joinDate}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteTeacher(teacher.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-gray-200 text-sm text-gray-600">
            Showing {teachers.length} teachers
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
