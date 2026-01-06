import * as XLSX from 'xlsx';

interface MemberExportData {
  fullName: string;
  studentId: string;
  email: string;
  role: string;
}

export function exportMembersToExcel(
  members: MemberExportData[],
  filename: string = 'danh-sach-thanh-vien'
) {
  // Prepare data with STT and Vietnamese headers
  const data = members.map((member, index) => ({
    'STT': index + 1,
    'Họ và tên': member.fullName || '',
    'Mã số sinh viên': member.studentId || '',
    'Email': member.email || '',
    'Vai trò': member.role || 'Thành viên'
  }));

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },  // STT
    { wch: 25 }, // Họ và tên
    { wch: 15 }, // MSSV
    { wch: 30 }, // Email
    { wch: 15 }  // Vai trò
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Thành viên');

  // Generate file and trigger download
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function getRoleDisplayName(role: string): string {
  switch (role) {
    case 'leader':
      return 'Trưởng nhóm';
    case 'admin':
      return 'Admin';
    case 'member':
    default:
      return 'Thành viên';
  }
}
