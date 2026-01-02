import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import AdminBackupRestore from '@/components/AdminBackupRestore';

export default function AdminBackup() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Bạn không có quyền truy cập trang này</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Sao lưu & Khôi phục</h1>
          <p className="text-muted-foreground">Quản lý sao lưu và khôi phục dữ liệu project</p>
        </div>
        <AdminBackupRestore />
      </div>
    </DashboardLayout>
  );
}
