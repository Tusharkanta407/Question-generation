import { Video, CircleHelp, Users, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';

interface StatCardsProps {
  lecturesUploaded: number;
  questionsGenerated: number;
  studentsActive: number;
}

export default function StatCards({
  lecturesUploaded,
  questionsGenerated,
  studentsActive,
}: StatCardsProps) {
  const stats = [
    {
      label: 'Lectures Uploaded',
      value: (lecturesUploaded ?? 0).toString(),
      icon: Video,
      color: 'text-blue-500',
    },
    {
      label: 'Questions Generated',
      value: questionsGenerated.toString(),
      icon: CircleHelp,
      color: 'text-zinc-100',
    },
    {
      label: 'Students Active',
      value: studentsActive.toString(),
      icon: Users,
      color: 'text-zinc-100',
    },
    {
      label: 'Trending Topic',
      value: 'Quantum Optics',
      icon: TrendingUp,
      color: 'text-zinc-100',
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <motion.div
           key={stat.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="premium-card p-6 border-white/5 dark:bg-gradient-to-br dark:from-slate-900 dark:via-indigo-950 dark:to-zinc-900 transition-colors"
        >
          <div className="text-[10px] uppercase tracking-widest text-premium-muted font-black mb-3">{stat.label}</div>
          <div className="flex items-end justify-between">
            <h3 className={`text-2xl font-extrabold tracking-tighter ${stat.color}`}>{stat.value}</h3>
            <stat.icon size={20} className="text-premium-muted opacity-40" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
