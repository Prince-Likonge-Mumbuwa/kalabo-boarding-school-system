import { DashboardLayout } from '@/components/DashboardLayout';
import { useState } from 'react';
import { Plus, Trash2, Edit2, Users } from 'lucide-react';

interface Class {
  id: string;
  name: string;
  form: string;
  students: number;
  teacher: string;
  createdDate: string;
}

export default function ClassManagement() {
  const [classes, setClasses] = useState<Class[]>([
    { id: '1', name: 'Form 4A', form: '4', students: 35, teacher: 'Mr. Johnson', createdDate: '2024-01-15' },
    { id: '2', name: 'Form 4B', form: '4', students: 32, teacher: 'Mrs. Smith', createdDate: '2024-01-15' },
    { id: '3', name: 'Form 3A', form: '3', students: 38, teacher: 'Mr. Banda', createdDate: '2024-01-16' },
    { id: '4', name: 'Form 3B', form: '3', students: 36, teacher: 'Ms. Chileshe', createdDate: '2024-01-16' },
    { id: '5', name: 'Form 2A', form: '2', students: 40, teacher: 'Mr. Phiri', createdDate: '2024-01-17' },
    { id: '6', name: 'Form 1A', form: '1', students: 42, teacher: 'Miss Mulenga', createdDate: '2024-01-17' },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', form: '', teacher: '' });

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.form && formData.teacher) {
      const newClass: Class = {
        id: Date.now().toString(),
        name: formData.name,
        form: formData.form,
        students: 0,
        teacher: formData.teacher,
        createdDate: new Date().toISOString().split('T')[0],
      };
      setClasses([...classes, newClass]);
      setFormData({ name: '', form: '', teacher: '' });
      setShowForm(false);
    }
  };

  const handleDeleteClass = (id: string) => {
    setClasses(classes.filter(c => c.id !== id));
  };

  return (
    <DashboardLayout activeTab="classes">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Class Management</h1>
            <p className="text-gray-600 mt-1">Create and manage classes in your school</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus size={20} />
            Create Class
          </button>
        </div>

        {/* Create Class Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Class</h2>
            <form onSubmit={handleAddClass} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Class Name (e.g., Form 4A)"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="text"
                placeholder="Form (1, 2, 3, 4)"
                value={formData.form}
                onChange={e => setFormData({ ...formData, form: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="text"
                placeholder="Class Teacher"
                value={formData.teacher}
                onChange={e => setFormData({ ...formData, teacher: e.target.value })}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                className="col-span-1 sm:col-span-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Create Class
              </button>
            </form>
          </div>
        )}

        {/* Classes Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Class Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Form</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Students</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Class Teacher</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Created</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {classes.map((classItem) => (
                  <tr key={classItem.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{classItem.name}</td>
                    <td className="px-6 py-4 text-gray-600">Form {classItem.form}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Users size={16} />
                        {classItem.students}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{classItem.teacher}</td>
                    <td className="px-6 py-4 text-gray-600 text-sm">{classItem.createdDate}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteClass(classItem.id)}
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
            Showing {classes.length} classes
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
