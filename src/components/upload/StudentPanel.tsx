import { useEffect, useState } from 'react';
import { Search, UserPlus, Mail, MessageSquare, Send, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type Student = {
  id: string;
  name: string;
  email: string;
  batch: string;
};

interface StudentPanelProps {
  isProcessing: boolean;
  canSend: boolean;
  onSend: (selectedStudents: Student[]) => void;
  onStudentCountChange: (count: number) => void;
}

export default function StudentPanel({ isProcessing, canSend, onSend, onStudentCountChange }: StudentPanelProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [delivery, setDelivery] = useState<'email' | 'whatsapp'>('email');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', batch: '' });

  const toggleStudent = (id: string) => {
    setSelected(prev => 
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const addStudent = () => {
    const name = newStudent.name.trim();
    const email = newStudent.email.trim();
    const batch = newStudent.batch.trim();

    if (!name || !email || !batch) return;

    const id = crypto.randomUUID();
    setStudents((prev) => [...prev, { id, name, email, batch }]);
    setSelected((prev) => [...prev, id]);
    setNewStudent({ name: '', email: '', batch: '' });
    setShowAddForm(false);
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    s.batch.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    onStudentCountChange(students.length);
  }, [students.length, onStudentCountChange]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[10px] font-black text-premium-muted uppercase tracking-widest">Student Workspace</h3>
        <button
          onClick={() => setShowAddForm((prev) => !prev)}
          className="text-[10px] font-black text-premium-muted hover:text-premium-text flex items-center gap-1.5 transition-colors uppercase tracking-widest"
        >
          <UserPlus size={14} />
          Add Student
        </button>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 p-4 rounded-2xl border border-premium-border bg-premium-card space-y-3"
          >
            <input
              type="text"
              placeholder="Student Name"
              value={newStudent.name}
              onChange={(e) => setNewStudent((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full bg-premium-bg border border-premium-border rounded-lg px-3 py-2 text-xs text-premium-text focus:outline-none focus:border-blue-500/50 transition-all shadow-sm"
            />
            <input
              type="email"
              placeholder="Student Email"
              value={newStudent.email}
              onChange={(e) => setNewStudent((prev) => ({ ...prev, email: e.target.value }))}
              className="w-full bg-premium-bg border border-premium-border rounded-lg px-3 py-2 text-xs text-premium-text focus:outline-none focus:border-blue-500/50 transition-all shadow-sm"
            />
            <input
              type="text"
              placeholder="Batch"
              value={newStudent.batch}
              onChange={(e) => setNewStudent((prev) => ({ ...prev, batch: e.target.value }))}
              className="w-full bg-premium-bg border border-premium-border rounded-lg px-3 py-2 text-xs text-premium-text focus:outline-none focus:border-blue-500/50 transition-all shadow-sm"
            />
            <button
              onClick={addStudent}
              className="w-full bg-premium-text dark:bg-zinc-100 text-premium-bg dark:text-zinc-900 text-[10px] font-black py-2.5 rounded-xl transition-all active:scale-[0.98] uppercase tracking-widest border border-premium-border"
            >
              Add to List
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-premium-bg border border-premium-border flex-1 flex flex-col overflow-hidden rounded-2xl shadow-inner">
        <div className="p-4 border-b border-premium-border bg-premium-sidebar/40">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-premium-muted" />
            <input 
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-premium-card border border-premium-border rounded-lg pl-9 pr-4 py-2 text-xs text-premium-text focus:outline-none focus:border-blue-500/50 transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin scrollbar-thumb-premium-border">
          {filteredStudents.length === 0 ? (
            <div className="h-full min-h-[120px] flex items-center justify-center text-xs text-premium-muted">
              No students yet. Click Add Student.
            </div>
          ) : (
            filteredStudents.map((student) => (
              <div 
                key={student.id}
                onClick={() => toggleStudent(student.id)}
                className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                  selected.includes(student.id) 
                    ? 'bg-premium-card text-premium-text shadow-sm border border-premium-border' 
                    : 'text-premium-muted hover:bg-premium-subtle hover:text-premium-text'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center ${
                    selected.includes(student.id) 
                      ? 'border-blue-500 bg-blue-500 text-white shadow-[0_0_8px_rgba(59,130,246,0.5)]' 
                      : 'border-premium-border bg-transparent'
                  }`}>
                    {selected.includes(student.id) && <Check size={10} strokeWidth={4} />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">{student.name}</span>
                    <span className="text-[10px] opacity-60">{student.email}</span>
                  </div>
                </div>
                <span className="text-[10px] opacity-40 font-black uppercase tracking-tighter">{student.batch}</span>
              </div>
            ))
          )}
        </div>

        <div className="p-6 border-t border-premium-border bg-premium-sidebar/40 space-y-6">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-premium-muted uppercase tracking-widest">Delivery Method</label>
            <div className="space-y-2">
              <label 
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => setDelivery('email')}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                  delivery === 'email' ? 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.2)]' : 'border-premium-border'
                }`}>
                  {delivery === 'email' && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                </div>
                <span className={`text-xs font-medium transition-colors ${delivery === 'email' ? 'text-premium-text' : 'text-premium-muted group-hover:text-premium-text'}`}>Email Notification</span>
              </label>
              <label 
                 className="flex items-center gap-2 cursor-pointer group"
                 onClick={() => setDelivery('whatsapp')}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                  delivery === 'whatsapp' ? 'border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.2)]' : 'border-premium-border'
                }`}>
                  {delivery === 'whatsapp' && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                </div>
                <span className={`text-xs font-medium transition-colors ${delivery === 'whatsapp' ? 'text-premium-text' : 'text-premium-muted group-hover:text-premium-text'}`}>WhatsApp Direct</span>
              </label>
            </div>
          </div>

          <button 
            type="button"
            onClick={() =>
              onSend(students.filter((s) => selected.includes(s.id)))
            }
            disabled={selected.length === 0 || isProcessing || !canSend}
            className="w-full bg-premium-text dark:bg-zinc-100 text-premium-bg dark:text-zinc-900 text-[10px] font-black py-3.5 rounded-xl transition-all active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-3 border border-premium-border shadow-xl uppercase tracking-[0.2em]"
          >
            <Send size={14} />
            SEND ACCESS
          </button>
        </div>
      </div>
    </div>
  );
}
