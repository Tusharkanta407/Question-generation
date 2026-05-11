import { 
  LayoutDashboard, 
  Video, 
  CircleHelp, 
  Users, 
  BarChart3, 
  TrendingUp, 
  Settings, 
  UserCircle2,
  Zap
} from 'lucide-react';
import { motion } from 'motion/react';
import Image from 'next/image';
import profileImage from '../../../app/image.png';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'lectures', label: 'Lectures', icon: Video },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <aside className="w-64 h-screen border-r border-premium-border bg-premium-sidebar flex flex-col p-6 fixed left-0 top-0">
      <div className="mb-10 px-2">
        <img src="/acadzalogo.svg" alt="Acadza logo" className="h-10 w-auto object-contain" />
      </div>

      <nav className="flex-1 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full ${activeTab === item.id ? 'sidebar-item-active' : 'sidebar-item'}`}
          >
            <item.icon size={20} className="opacity-70" />
            <span className="text-[15px]">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-6 ">
        <div className="flex items-center gap-3 px-2 py-3 rounded-xl transition-all border-t border-premium-border">
          <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border border-premium-border shadow-sm bg-premium-card">
            <Image src={profileImage} alt="Anshul Sir" width={36} height={36} className="h-full w-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate text-premium-text">Anshul Sir</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
