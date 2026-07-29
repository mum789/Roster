// ─── Global State ──────────────────────────────────────────────
// Submissions are loaded from Supabase on admin login
let globalSubmissions = [];
let editingIndex = null;
let employeeDesignationMap = {};
let adminSession = null;

function populateEmployeeDropdown() {
  const select = document.getElementById('userName');
  const currentSelected = select.value;
  select.innerHTML = '<option value="" disabled selected>Select Employee</option>';
  
  for (const name in employeeDesignationMap) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }
  if (currentSelected) {
    select.value = currentSelected;
  }
}

function getTodayInputFormat() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function convertDisplayToInputDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    return `${year}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0].slice(-2)}`;
  }
  return dateStr;
}

function toShortDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    return `${parts[0]}.${parts[1]}.${parts[2].slice(-2)}`;
  }
  return dateStr;
}

function parseDDMMYYYY(dateStr) {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('.');
  if (parts.length === 3) {
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    return new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return new Date(dateStr);
}

function getSortedSubmissions() {
  return [...globalSubmissions].sort((a, b) => {
    return parseDDMMYYYY(a.date) - parseDDMMYYYY(b.date);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadEmployees();
  populateEmployeeDropdown();
  const subDateInput = document.getElementById('subDate');
  if (subDateInput && !subDateInput.value) {
    subDateInput.value = getTodayInputFormat();
  }
  // No longer auto-caching admin session on page load
});

function numberToWords(num) {
  const a = ['','One ','Two ','Three ','Four ','Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
  const b = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  
  num = Math.floor(num);
  if (num === 0) return 'Zero Only';

  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? inWords(n % 10000000) : '');
  }

  return (inWords(num).trim() + ' Only').replace(/\s+/g, ' ');
}

function updateDesignation() {
  const empName = document.getElementById('userName').value;
  const desigInput = document.getElementById('userDesig');
  desigInput.value = employeeDesignationMap[empName] || '';
}

function updateAmount() {
  const purpose = document.getElementById('userPurpose').value;
  const amountInput = document.getElementById('userAmount');

  if (purpose === 'Roster Duty') {
    amountInput.value = 1200;
  } else if (purpose === 'Roster Duty (Holiday)') {
    amountInput.value = 1000;
  } else {
    amountInput.value = '';
  }
}

async function switchView(view) {
  if(view === 'admin') {
    // Always clear cached admin session and show login modal
    adminSession = null;
    document.getElementById('loginPasswordInput').value = '';
    document.getElementById('adminLoginModal').style.display = 'flex';
    document.getElementById('loginPasswordInput').focus();
  } else {
    adminSession = null;
    document.getElementById('userPanel').style.display = 'block';
    document.getElementById('adminPanel').style.display = 'none';
  }
}

function closeAdminLoginModal() {
  document.getElementById('adminLoginModal').style.display = 'none';
}

async function verifyAdminLogin() {
  const pass = document.getElementById('loginPasswordInput').value;

  if (!pass) {
    alert("Please enter the admin password!");
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: pass
  });

  if (error) {
    alert("Wrong Password!");
    return;
  }

  // Verify admin role in roster.profiles
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    alert("You do not have admin privileges!");
    await supabaseClient.auth.signOut();
    return;
  }

  adminSession = data.session;
  closeAdminLoginModal();
  document.getElementById('userPanel').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';

  const subDateInput = document.getElementById('subDate');
  if (subDateInput && !subDateInput.value) {
    subDateInput.value = getTodayInputFormat();
  }

  await loadAdminSettings();
  await loadSubmissions();
  renderAdminTable();
  setupSettingsAutoSave();
}

document.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    if (document.getElementById('adminLoginModal').style.display === 'flex') {
      verifyAdminLogin();
    }
  }
});

function openAddUserModal() {
  document.getElementById('newEmpName').value = '';
  document.getElementById('newEmpDesig').value = '';
  document.getElementById('addUserModal').style.display = 'flex';
}

function closeAddUserModal() {
  document.getElementById('addUserModal').style.display = 'none';
}

async function saveNewUser() {
  const name = document.getElementById('newEmpName').value.trim();
  const desig = document.getElementById('newEmpDesig').value.trim();

  if (!name || !desig) {
    alert("Please enter both Employee Name and Designation!");
    return;
  }

  // Check if employee already exists (by name)
  const { data: existing } = await supabaseClient
    .from('employees')
    .select('id')
    .eq('name', name)
    .maybeSingle();

  if (existing) {
    // Update designation of existing employee
    const { error } = await supabaseClient
      .from('employees')
      .update({ designation: desig })
      .eq('id', existing.id);
    if (error) {
      alert("Error updating employee: " + error.message);
      return;
    }
  } else {
    // Insert new employee
    const { error } = await supabaseClient
      .from('employees')
      .insert({ name, designation: desig });
    if (error) {
      alert("Error adding employee: " + error.message);
      return;
    }
  }

  await loadEmployees();
  populateEmployeeDropdown();
  closeAddUserModal();
  alert("Employee saved successfully!");
}

function openResetPasswordModal() {
  document.getElementById('oldPassInput').value = '';
  document.getElementById('newPassInput').value = '';
  document.getElementById('confirmPassInput').value = '';
  document.getElementById('resetPasswordModal').style.display = 'flex';
}

function closeResetPasswordModal() {
  document.getElementById('resetPasswordModal').style.display = 'none';
}

async function saveNewPassword() {
  const oldPass = document.getElementById('oldPassInput').value;
  const newPass = document.getElementById('newPassInput').value;
  const confirmPass = document.getElementById('confirmPassInput').value;

  if (!oldPass || !newPass || !confirmPass) {
    alert("Please fill in all password fields!");
    return;
  }

  if (newPass !== confirmPass) {
    alert("New password and confirm password do not match!");
    return;
  }

  if (newPass.length < 4) {
    alert("Password must be at least 4 characters long!");
    return;
  }

  // Verify old password by attempting sign-in
  const { error: signInError } = await supabaseClient.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: oldPass
  });

  if (signInError) {
    alert("Current password is incorrect!");
    return;
  }

  // Update to new password
  const { error: updateError } = await supabaseClient.auth.updateUser({
    password: newPass
  });

  if (updateError) {
    alert("Failed to update password: " + updateError.message);
    return;
  }

  closeResetPasswordModal();
  alert("Admin password updated successfully!");
}

async function submitData() {
  const rawDate = document.getElementById('userDate').value;
  const name = document.getElementById('userName').value;
  const desig = document.getElementById('userDesig').value.trim();
  const purpose = document.getElementById('userPurpose').value;
  const amount = document.getElementById('userAmount').value.trim();
  const sig = document.getElementById('userSig').value.trim();

  if (!rawDate || !name || !desig || !purpose) {
    alert("Please select Date of Duty, Employee Name, and Purpose!");
    return;
  }

  // Look up employee_id from the employees table
  const { data: emp, error: empError } = await supabaseClient
    .from('employees')
    .select('id')
    .eq('name', name)
    .single();

  if (empError || !emp) {
    alert("Employee not found in database! Please contact admin.");
    return;
  }

  const submissionData = {
    employee_id: emp.id,
    employee_name: name,
    designation: desig,
    date_of_duty: rawDate,
    purpose: purpose,
    amount: parseFloat(amount) || 0,
    signature: sig || null
  };

  if (editingIndex !== null) {
    const existing = globalSubmissions[editingIndex];
    const { error } = await supabaseClient
      .from('roster_submissions')
      .update(submissionData)
      .eq('id', existing.id);

    if (error) {
      alert("Error updating application: " + error.message);
      return;
    }
    alert("Application Updated Successfully!");
    cancelEditMode();
  } else {
    const { error } = await supabaseClient
      .from('roster_submissions')
      .insert(submissionData);

    if (error) {
      alert("Error submitting application: " + error.message);
      return;
    }
    alert("Data Submitted Successfully!");

    document.getElementById('userDate').value = '';
    document.getElementById('userName').selectedIndex = 0;
    document.getElementById('userDesig').value = '';
    document.getElementById('userPurpose').selectedIndex = 0;
    document.getElementById('userAmount').value = '';
    document.getElementById('userSig').value = '';
  }

  await loadSubmissions();
}

function editItem(originalIndex) {
  const item = globalSubmissions[originalIndex];
  if (!item) return;

  editingIndex = originalIndex;

  document.getElementById('userPanel').style.display = 'block';
  document.getElementById('adminPanel').style.display = 'none';

  document.getElementById('userDate').value = convertDisplayToInputDate(item.date);
  document.getElementById('userName').value = item.name;
  document.getElementById('userDesig').value = item.desig;
  document.getElementById('userPurpose').value = item.purpose;
  document.getElementById('userAmount').value = item.amount;
  document.getElementById('userSig').value = item.sig || '';

  document.getElementById('panelTitleText').textContent = "Edit Roster Duty Application";
  document.getElementById('panelSubText').textContent = "Modify the details below and click Update";
  document.getElementById('submitBtnElement').textContent = "Update Application";
  document.getElementById('cancelEditBtn').style.display = 'block';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEditMode() {
  editingIndex = null;
  document.getElementById('panelTitleText').textContent = "User Panel - Roster Duty Application";
  document.getElementById('panelSubText').textContent = "Fill in your details below and submit for Admin approval";
  document.getElementById('submitBtnElement').textContent = "Submit Application to Admin";
  document.getElementById('cancelEditBtn').style.display = 'none';

  document.getElementById('userDate').value = '';
  document.getElementById('userName').selectedIndex = 0;
  document.getElementById('userDesig').value = '';
  document.getElementById('userPurpose').selectedIndex = 0;
  document.getElementById('userAmount').value = '';
  document.getElementById('userSig').value = '';
}

function renderAdminTable() {
  const tbody = document.getElementById('adminTableBody');
  tbody.innerHTML = '';

  const sortedList = getSortedSubmissions();

  if (sortedList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">No submissions found yet.</td></tr>`;
    return;
  }

  sortedList.forEach((item) => {
    const originalIndex = globalSubmissions.findIndex(sub => sub.id === item.id);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${toShortDate(item.date)}</td>
      <td>${item.name}</td>
      <td>${item.desig}</td>
      <td>${item.purpose}</td>
      <td>${parseFloat(item.amount).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
      <td>${item.sig || ''}</td>
      <td>
        <button style="color:blue; cursor:pointer; margin-right:5px;" onclick="editItem(${originalIndex})">Edit</button>
        <button style="color:red; cursor:pointer;" onclick="deleteItem(${originalIndex})">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteItem(index) {
  if (index > -1) {
    if (confirm("Are you sure you want to delete this entry?")) {
      const item = globalSubmissions[index];
      const { error } = await supabaseClient
        .from('roster_submissions')
        .delete()
        .eq('id', item.id);

      if (error) {
        alert("Error deleting entry: " + error.message);
        return;
      }

      globalSubmissions.splice(index, 1);
      renderAdminTable();
    }
  }
}

async function clearAllData() {
  if (confirm("Are you sure you want to delete all entries?")) {
    // Delete all submissions (match-all condition using zero-UUID)
    const { error } = await supabaseClient
      .from('roster_submissions')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      alert("Error clearing data: " + error.message);
      return;
    }

    globalSubmissions = [];
    renderAdminTable();
  }
}

function generateReportPDF() {
  if (globalSubmissions.length === 0) {
    alert("No submissions available to generate PDF!");
    return;
  }

  document.getElementById('pdf-out-main-div').textContent = document.getElementById('mainDivision').value;
  document.getElementById('pdf-out-month').textContent = document.getElementById('reportMonth').value;
  document.getElementById('pdf-out-sub-div').textContent = document.getElementById('subDivision').value;
  
  let rawSubDate = document.getElementById('subDate').value;
  if (!rawSubDate) {
    rawSubDate = getTodayInputFormat();
    document.getElementById('subDate').value = rawSubDate;
  }
  document.getElementById('pdf-out-sub-date').textContent = toShortDate(formatDateDisplay(rawSubDate));

  const pdfTbody = document.getElementById('pdf-out-table-body');
  pdfTbody.innerHTML = '';

  let grandTotal = 0;
  const sortedList = getSortedSubmissions();

  sortedList.forEach(item => {
    const numericAmount = parseFloat(item.amount) || 0;
    grandTotal += numericAmount;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${toShortDate(item.date)}</td>
      <td style="text-align: left;">${item.name}</td>
      <td>${item.desig}</td>
      <td>${item.purpose}</td>
      <td>${numericAmount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
      <td>${item.sig || ''}</td>
    `;
    pdfTbody.appendChild(tr);
  });

  const formattedTotal = grandTotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const inWords = numberToWords(grandTotal);

  const totalTr = document.createElement('tr');
  totalTr.className = 'pdf-total-row';
  totalTr.innerHTML = `
    <td colspan="4" style="text-align: right; padding: 4px 8px;">
      Total Taka: ${inWords}
    </td>
    <td style="text-align: center;">${formattedTotal}</td>
    <td></td>
  `;
  pdfTbody.appendChild(totalTr);

  const element = document.getElementById('pdf-render-area');
  
  const opt = {
    margin:       [4, 4, 8, 4],
    filename:     'Allowance_for_Roster_Duty_Detail.pdf',
    image:        { type: 'jpeg', quality: 1.0 },
    html2canvas:  { scale: 2, scrollY: 0, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save();
}

function generateSummaryPDF() {
  if (globalSubmissions.length === 0) {
    alert("No submissions to generate summary report!");
    return;
  }

  const summaryTitleVal = document.getElementById('summaryTitleInput').value;
  document.getElementById('summary-out-title').textContent = `Summary of the allowances for Rostering Duty: ${summaryTitleVal}`;

  const grouped = {};
  const sortedList = getSortedSubmissions();

  let grandTotal = 0;

  sortedList.forEach(item => {
    const key = item.name.trim().toLowerCase();
    const amt = parseFloat(item.amount) || 0;
    grandTotal += amt;

    if (!grouped[key]) {
      grouped[key] = {
        name: item.name,
        desig: item.desig,
        dates: [],
        amounts: []
      };
    }
    grouped[key].dates.push(item.date);
    grouped[key].amounts.push(amt);
  });

  const summaryTbody = document.getElementById('summary-out-table-body');
  summaryTbody.innerHTML = '';

  let sl = 1;
  for (const key in grouped) {
    const emp = grouped[key];
    
    emp.dates.sort((a, b) => parseDDMMYYYY(a) - parseDDMMYYYY(b));
    
    let dateChunks = [];
    for (let i = 0; i < emp.dates.length; i += 2) {
      dateChunks.push(emp.dates.slice(i, i + 2).map(d => toShortDate(d)).join(', '));
    }
    const datesStr = dateChunks.join(',<br>');
    
    const formattedAmounts = emp.amounts.map(amt => amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    let amountChunks = [];
    for (let i = 0; i < formattedAmounts.length; i += 2) {
      amountChunks.push(formattedAmounts.slice(i, i + 2).join('+'));
    }
    const amountSumStr = amountChunks.join('+<br>');
    
    const totalAmount = emp.amounts.reduce((sum, val) => sum + val, 0);
    const totalAmountFormatted = totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${String(sl).padStart(2, '0')}</td>
      <td style="text-align: left; font-weight: 500;">${emp.name}</td>
      <td>${emp.desig}</td>
      <td>${datesStr}</td>
      <td>${amountSumStr}</td>
      <td style="font-weight: bold;">${totalAmountFormatted}</td>
      <td></td>
    `;
    summaryTbody.appendChild(tr);
    sl++;
  }

  const formattedGrandTotal = grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inWordsText = numberToWords(grandTotal);

  const totalTr = document.createElement('tr');
  totalTr.className = 'pdf-total-row';
  totalTr.innerHTML = `
    <td colspan="5" style="text-align: right; padding: 4px 6px; font-weight: bold;">Total</td>
    <td style="text-align: center; font-weight: bold;">${formattedGrandTotal}</td>
    <td></td>
  `;
  summaryTbody.appendChild(totalTr);

  const wordsTr = document.createElement('tr');
  wordsTr.className = 'pdf-total-row';
  wordsTr.innerHTML = `
    <td colspan="7" style="text-align: center; padding: 4px 6px; font-weight: bold; background-color: #ffffff !important;">
      Total Taka: ${inWordsText}
    </td>
  `;
  summaryTbody.appendChild(wordsTr);

  const element = document.getElementById('summary-render-area');
  const opt = {
    margin:       [4, 4, 8, 4],
    filename:     'Roster_Duty_Summary_Report.pdf',
    image:        { type: 'jpeg', quality: 1.0 },
    html2canvas:  { scale: 2, scrollY: 0, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(element).save();
}

// =============================================================
// SUPABASE CRUD FUNCTIONS
// =============================================================

// ─── Employees ───────────────────────────────────────────────
// Load all employees from Supabase and build the designation map
async function loadEmployees() {
  const { data, error } = await supabaseClient
    .from('employees')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error loading employees:', error);
    return;
  }

  employeeDesignationMap = {};
  (data || []).forEach(emp => {
    employeeDesignationMap[emp.name] = emp.designation;
  });
}

// ─── Submissions ─────────────────────────────────────────────
// Load all roster_submissions from Supabase with joined employee data.
// Transforms Supabase columns → display format used by existing code.
async function loadSubmissions() {
  const { data, error } = await supabaseClient
    .from('roster_submissions')
    .select('*, employees(name, designation)')
    .order('date_of_duty');

  if (error) {
    console.error('Error loading submissions:', error);
    return;
  }

  globalSubmissions = (data || []).map(sub => ({
    id: sub.id,
    employee_id: sub.employee_id,
    date: formatDateDisplay(sub.date_of_duty),
    name: sub.employees?.name || '',
    desig: sub.employees?.designation || '',
    purpose: sub.purpose,
    amount: Number(sub.amount),
    sig: sub.signature || ''
  }));
}

// ─── Admin Settings ──────────────────────────────────────────
// Load admin_settings from Supabase and populate the input fields
async function loadAdminSettings() {
  const { data, error } = await supabaseClient
    .from('admin_settings')
    .select('key, value');

  if (error) {
    console.error('Error loading admin settings:', error);
    return;
  }

  const settingsMap = {};
  (data || []).forEach(s => { settingsMap[s.key] = s.value; });

  if (settingsMap.main_division)
    document.getElementById('mainDivision').value = settingsMap.main_division;
  if (settingsMap.report_month)
    document.getElementById('reportMonth').value = settingsMap.report_month;
  if (settingsMap.summary_title)
    document.getElementById('summaryTitleInput').value = settingsMap.summary_title;
  if (settingsMap.sub_division)
    document.getElementById('subDivision').value = settingsMap.sub_division;
  if (settingsMap.sub_date)
    document.getElementById('subDate').value = settingsMap.sub_date;
}

// Save admin settings from input fields to Supabase (upsert by key)
async function saveAdminSettings() {
  const settings = [
    { key: 'main_division', value: document.getElementById('mainDivision').value },
    { key: 'report_month', value: document.getElementById('reportMonth').value },
    { key: 'summary_title', value: document.getElementById('summaryTitleInput').value },
    { key: 'sub_division', value: document.getElementById('subDivision').value },
    { key: 'sub_date', value: document.getElementById('subDate').value }
  ];

  for (const s of settings) {
    // Check if key exists
    const { data: existing } = await supabaseClient
      .from('admin_settings')
      .select('id')
      .eq('key', s.key)
      .maybeSingle();

    if (existing) {
      await supabaseClient
        .from('admin_settings')
        .update({ value: s.value })
        .eq('id', existing.id);
    } else {
      await supabaseClient
        .from('admin_settings')
        .insert({ key: s.key, value: s.value });
    }
  }
}

// Auto-save admin settings when input fields lose focus
function setupSettingsAutoSave() {
  const settingIds = ['mainDivision', 'reportMonth', 'summaryTitleInput', 'subDivision', 'subDate'];
  settingIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.removeEventListener('blur', saveAdminSettings);
      el.addEventListener('blur', saveAdminSettings);
    }
  });
}

// ─── One-Time Migration from localStorage → Supabase ────────
// Run this ONCE in the browser console after connecting Supabase:
//   await migrateFromLocalStorage();
// It reads existing data from localStorage and writes it to Supabase.
async function migrateFromLocalStorage() {
  const migrationLog = [];

  // 1. Migrate employees
  const oldMap = JSON.parse(localStorage.getItem('my_employee_map') || '{}');
  const empNames = Object.keys(oldMap);
  if (empNames.length > 0) {
    for (const name of empNames) {
      const desig = oldMap[name];
      const { data: existing } = await supabaseClient
        .from('employees')
        .select('id')
        .eq('name', name)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabaseClient
          .from('employees')
          .insert({ name, designation: desig });
        if (error) {
          migrationLog.push(`EMPLOYEE FAIL [${name}]: ${error.message}`);
        } else {
          migrationLog.push(`EMPLOYEE OK   [${name}]`);
        }
      } else {
        migrationLog.push(`EMPLOYEE SKIP [${name}] (already exists)`);
      }
    }
  } else {
    migrationLog.push('EMPLOYEES: No localStorage data found.');
  }

  // 2. Migrate submissions
  const oldSubs = JSON.parse(localStorage.getItem('my_roster_data') || '[]');
  if (oldSubs.length > 0) {
    for (const sub of oldSubs) {
      // Look up employee_id by name
      const { data: emp } = await supabaseClient
        .from('employees')
        .select('id')
        .eq('name', sub.name)
        .single();

      if (!emp) {
        migrationLog.push(`SUBMISSION FAIL [${sub.name} on ${sub.date}]: employee not found`);
        continue;
      }

      // Convert display date (DD.MM.YY) to ISO (YYYY-MM-DD)
      const isoDate = convertDisplayToInputDate(sub.date);

      const { error } = await supabaseClient
        .from('roster_submissions')
        .insert({
          employee_id: emp.id,
          date_of_duty: isoDate,
          purpose: sub.purpose,
          amount: parseFloat(sub.amount) || 0,
          signature: sub.sig || null
        });

      if (error) {
        migrationLog.push(`SUBMISSION FAIL [${sub.name} on ${sub.date}]: ${error.message}`);
      } else {
        migrationLog.push(`SUBMISSION OK   [${sub.name} on ${sub.date}]`);
      }
    }
  } else {
    migrationLog.push('SUBMISSIONS: No localStorage data found.');
  }

  // 3. Migrate admin password hint (user must set up Supabase Auth manually)
  const oldPass = localStorage.getItem('my_admin_password');
  if (oldPass) {
    migrationLog.push(`PASSWORD: Found saved password in localStorage.`);
    migrationLog.push(`PASSWORD: Set up the admin user in Supabase Auth dashboard with email "${ADMIN_EMAIL}" and password "${oldPass}".`);
    migrationLog.push(`PASSWORD: After that, delete 'my_admin_password' from localStorage for security.`);
  }

  console.log('=== MIGRATION COMPLETE ===');
  migrationLog.forEach(line => console.log(line));
  alert('Migration complete! Check the browser console (F12) for details.');
}
