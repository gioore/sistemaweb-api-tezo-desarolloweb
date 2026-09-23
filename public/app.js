const form = document.querySelector('#registration-form');
const formMessage = document.querySelector('#form-message');
const summary = document.querySelector('#summary');
const studentsBody = document.querySelector('#students-body');
const dashboardMessage = document.querySelector('#dashboard-message');
const refreshButton = document.querySelector('#refresh-button');
const studentDetail = document.querySelector('#student-detail');

const missionNames = {
  1: 'Crear API',
  2: 'Crear Frontend',
  3: 'Subir código a GitHub',
  4: 'Publicar en hosting',
  5: 'Pruebas de ingreso'
};

function setMessage(element, text, type = '') {
  element.textContent = text;
  element.className = element.id === 'form-message' ? `form-message ${type}` : `dashboard-message ${type}`;
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach((element) => {
    element.textContent = '';
  });
}

function showFieldErrors(fields = {}) {
  Object.entries(fields).forEach(([field, message]) => {
    const element = document.querySelector(`[data-error="${field}"]`);
    if (element) element.textContent = message;
  });
}

function renderSummary(students) {
  const average = students.length
    ? (students.reduce((total, student) => total + Number(student.PorcentajeAvance || 0), 0) / students.length).toFixed(1)
    : '0.0';
  const completed = students.filter((student) => Number(student.PorcentajeAvance) === 100).length;

  summary.replaceChildren();
  [
    ['Estudiantes registrados', students.length],
    ['Promedio de avance', `${average}%`],
    ['Estudiantes al 100%', completed]
  ].forEach(([label, value]) => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    const text = document.createElement('span');
    text.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = value;
    card.append(text, amount);
    summary.append(card);
  });
}

function renderStudentDetail(student, details) {
  studentDetail.hidden = false;
  studentDetail.replaceChildren();

  const heading = document.createElement('div');
  heading.className = 'detail-heading';
  const title = document.createElement('h3');
  title.textContent = `Detalle de ${student.Nombre}`;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'detail-close';
  closeButton.textContent = 'Cerrar';
  closeButton.addEventListener('click', () => {
    studentDetail.hidden = true;
  });
  heading.append(title, closeButton);

  const missionGrid = document.createElement('div');
  missionGrid.className = 'detail-missions';
  const studentDetails = details.filter((item) => item.Carnet === student.Carnet);
  const statusByMission = new Map(studentDetails.map((item) => [Number(item.MisionID), Boolean(item.Estado)]));

  Object.entries(missionNames).forEach(([id, name]) => {
    const complete = statusByMission.get(Number(id)) === true;
    const item = document.createElement('div');
    item.className = `detail-mission ${complete ? 'is-complete' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'detail-icon';
    icon.textContent = complete ? '✓' : '·';
    const label = document.createElement('span');
    label.textContent = name;
    const status = document.createElement('strong');
    status.textContent = complete ? 'Completada' : 'Pendiente';
    item.append(icon, label, status);
    missionGrid.append(item);
  });

  studentDetail.append(heading, missionGrid);
}

function renderStudents(students, details) {
  studentsBody.replaceChildren();
  studentDetail.hidden = true;

  if (!students.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'empty';
    cell.textContent = 'Todavía no hay estudiantes registrados.';
    row.append(cell);
    studentsBody.append(row);
    return;
  }

  students.forEach((student) => {
    const row = document.createElement('tr');
    const studentCell = document.createElement('td');
    const name = document.createElement('span');
    name.className = 'student-name';
    name.textContent = student.Nombre;
    const email = document.createElement('span');
    email.className = 'student-email';
    email.textContent = student.Correo;
    studentCell.append(name, email);

    const carnetCell = document.createElement('td');
    carnetCell.className = 'student-id';
    carnetCell.textContent = student.Carnet;

    const missionsCell = document.createElement('td');
    missionsCell.textContent = `${student.MisionesCompletadas || 0} / ${student.TotalMisiones || 5}`;

    const progressCell = document.createElement('td');
    const percent = Math.max(0, Math.min(100, Number(student.PorcentajeAvance || 0)));
    const track = document.createElement('div');
    track.className = 'progress-track';
    const value = document.createElement('div');
    value.className = 'progress-value';
    value.style.width = `${percent}%`;
    track.append(value);
    const label = document.createElement('span');
    label.className = 'progress-label';
    label.textContent = `${percent}% de avance`;
    progressCell.append(track, label);

    const detailCell = document.createElement('td');
    const detailButton = document.createElement('button');
    detailButton.type = 'button';
    detailButton.className = 'detail-button';
    detailButton.textContent = 'Ver detalle';
    detailButton.addEventListener('click', () => renderStudentDetail(student, details));
    detailCell.append(detailButton);

    row.append(studentCell, carnetCell, missionsCell, progressCell, detailCell);
    studentsBody.append(row);
  });
}

async function loadDashboard() {
  setMessage(dashboardMessage, '');
  refreshButton.disabled = true;

  try {
    const response = await fetch('/api/dashboard', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo cargar el tablero.');
    const students = Array.isArray(data.estudiantes) ? data.estudiantes : [];
    renderSummary(students);
    renderStudents(students, Array.isArray(data.detalles) ? data.detalles : []);
  } catch (error) {
    renderSummary([]);
    renderStudents([], []);
    setMessage(dashboardMessage, error.message, 'error');
  } finally {
    refreshButton.disabled = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFieldErrors();
  setMessage(formMessage, 'Enviando registro...');
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  const formData = new FormData(form);
  const completedMissions = new Set(formData.getAll('missions').map(Number));
  const data = {
    maestro: {
      carnet: String(formData.get('Carnet') || '').trim(),
      nombre: String(formData.get('Nombre') || '').trim(),
      correo: String(formData.get('Correo') || '').trim()
    },
    detalle: Object.keys(missionNames).map((id) => ({
      misionId: Number(id),
      estado: completedMissions.has(Number(id))
    }))
  };

  try {
    const response = await fetch('/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();

    if (!response.ok) {
      showFieldErrors(result.fields);
      throw new Error(result.error || 'No se pudo registrar la misión.');
    }

    setMessage(formMessage, 'Misión registrada correctamente.', 'success');
    await loadDashboard();
  } catch (error) {
    setMessage(formMessage, error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener('click', loadDashboard);
loadDashboard();
