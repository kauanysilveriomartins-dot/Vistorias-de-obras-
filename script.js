const STORAGE_KEY = "obracheck_dados_v1";
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const todayISO = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const formatDate = (value) => {
  if (!value) return "Não informada";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
};
const statusClass = (status) => ({
  "Em andamento": "pill-progress",
  "Planejada": "pill-planned",
  "Concluída": "pill-complete",
  "Paralisada": "pill-paused"
}[status] || "pill-progress");

let data = loadData();
let activeDetailId = null;
let toastTimer;

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { projects: [], inspections: [] };
    const parsed = JSON.parse(saved);
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      inspections: Array.isArray(parsed.inspections) ? parsed.inspections : []
    };
  } catch (error) {
    console.error("Não foi possível ler os dados locais:", error);
    return { projects: [], inspections: [] };
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(error);
    showToast("Não foi possível salvar. As imagens podem estar ocupando muito espaço; tente remover algumas fotos.");
    return false;
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3300);
}

function goToView(viewName) {
  const titles = { painel: "Painel geral", obras: "Obras cadastradas", vistorias: "Vistorias", relatorios: "Relatórios" };
  $$(".view").forEach(view => view.classList.toggle("active-view", view.id === `view-${viewName}`));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === viewName));
  $("#page-title").textContent = titles[viewName] || "ObraCheck";
  if (viewName === "relatorios") renderReports();
  window.location.hash = viewName;
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog && !dialog.open) dialog.showModal();
}
function closeDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog?.open) dialog.close();
}

function renderAll() {
  renderStats();
  renderRecentProjects();
  renderProjects();
  renderInspections();
  renderReports();
  populateProjectOptions();
}

function renderStats() {
  $("#stat-total").textContent = data.projects.length;
  $("#stat-progress").textContent = data.projects.filter(p => p.status === "Em andamento").length;
  $("#stat-inspections").textContent = data.inspections.length;
  $("#stat-complete").textContent = data.projects.filter(p => p.status === "Concluída").length;
}

function projectById(id) {
  return data.projects.find(project => project.id === id);
}

function renderRecentProjects() {
  const target = $("#recent-projects");
  const projects = [...data.projects].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);
  if (!projects.length) {
    target.innerHTML = `<div class="empty-state"><strong>Nenhuma obra cadastrada ainda</strong>Comece adicionando a primeira obra.</div>`;
    return;
  }
  target.innerHTML = `<table class="data-table"><thead><tr><th>Obra</th><th>Data de início</th><th>Situação</th></tr></thead><tbody>${projects.map(p => `
    <tr><td><span class="table-primary">${escapeHTML(p.name)}</span><span class="table-sub">${escapeHTML(p.address || "Endereço não informado")}</span></td>
    <td>${formatDate(p.startDate)}</td><td><span class="pill ${statusClass(p.status)}">${escapeHTML(p.status)}</span></td></tr>`).join("")}</tbody></table>`;
}

function renderProjects() {
  const target = $("#projects-list");
  const query = $("#project-search").value.trim().toLocaleLowerCase("pt-BR");
  const status = $("#project-status-filter").value;
  const projects = [...data.projects].filter(p => {
    const haystack = [p.name, p.address, p.manager].join(" ").toLocaleLowerCase("pt-BR");
    return haystack.includes(query) && (!status || p.status === status);
  }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (!projects.length) {
    target.innerHTML = `<div class="panel empty-state" style="grid-column:1/-1"><strong>${data.projects.length ? "Nenhuma obra encontrada" : "Seu painel começa aqui"}</strong>${data.projects.length ? "Tente alterar os filtros de busca." : "Clique em “Cadastrar obra” para registrar um projeto."}</div>`;
    return;
  }
  target.innerHTML = projects.map(p => {
    const count = data.inspections.filter(i => i.projectId === p.id).length;
    return `<article class="project-card">
      <div class="project-card-top"><div><h3>${escapeHTML(p.name)}</h3><div class="project-address">${escapeHTML(p.address || "Endereço não informado")}</div></div><span class="pill ${statusClass(p.status)}">${escapeHTML(p.status)}</span></div>
      <div class="project-meta"><div><span>DATA DE INÍCIO</span><strong>${formatDate(p.startDate)}</strong></div><div><span>RESPONSÁVEL</span><strong>${escapeHTML(p.manager || "Não informado")}</strong></div><div><span>PREVISÃO DE CONCLUSÃO</span><strong>${formatDate(p.endDate)}</strong></div><div><span>VISTORIAS</span><strong>${count} registro(s)</strong></div></div>
      <div class="project-actions"><button class="small-button" data-detail="${p.id}">Ver detalhes</button><button class="small-button" data-edit="${p.id}">Editar</button><button class="small-button" data-add-inspection="${p.id}">＋ Vistoria</button><button class="small-button danger" data-delete="${p.id}">Excluir</button></div>
    </article>`;
  }).join("");
}

function renderInspections() {
  const target = $("#inspections-list");
  const query = $("#inspection-search").value.trim().toLocaleLowerCase("pt-BR");
  const inspections = [...data.inspections].filter(i => {
    const p = projectById(i.projectId);
    return [p?.name, i.inspector, i.notes, i.result].join(" ").toLocaleLowerCase("pt-BR").includes(query);
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!inspections.length) {
    target.innerHTML = `<div class="empty-state"><strong>Nenhuma vistoria registrada</strong>Cadastre uma obra e registre a primeira vistoria.</div>`;
    return;
  }
  target.innerHTML = `<table class="data-table"><thead><tr><th>Obra / vistoriador</th><th>Data</th><th>Resultado</th><th>Fotos</th><th>Observações</th><th></th></tr></thead><tbody>${inspections.map(i => {
    const p = projectById(i.projectId);
    return `<tr><td><span class="table-primary">${escapeHTML(p?.name || "Obra removida")}</span><span class="table-sub">${escapeHTML(i.inspector || "Vistoriador não informado")}</span></td><td>${formatDate(i.date)}</td><td>${escapeHTML(i.result)}</td><td>${(i.photos || []).length}</td><td title="${escapeHTML(i.notes)}">${escapeHTML(i.notes.length > 45 ? i.notes.slice(0, 45) + "…" : i.notes)}</td><td><button class="small-button danger" data-delete-inspection="${i.id}">Excluir</button></td></tr>`;
  }).join("")}</tbody></table>`;
}

function renderReports() {
  const target = $("#report-summary");
  if (!target) return;
  const count = data.inspections.length;
  const pending = data.inspections.filter(i => i.result !== "Conforme").length;
  target.innerHTML = `
    <div class="report-box"><span>Total de obras cadastradas</span><strong>${data.projects.length}</strong></div>
    <div class="report-box"><span>Total de vistorias</span><strong>${count}</strong></div>
    <div class="report-box"><span>Vistorias com pendências / retorno</span><strong>${pending}</strong></div>`;
}

function populateProjectOptions(selectedId = "") {
  const select = $("#inspection-project");
  const previous = selectedId || select.value;
  select.innerHTML = `<option value="">Selecione uma obra</option>` + data.projects
    .filter(p => p.status !== "Concluída")
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("");
  if (data.projects.some(p => p.id === previous)) select.value = previous;
}

function resetProjectForm(project = null) {
  $("#project-form").reset();
  $("#project-id").value = project?.id || "";
  $("#project-modal-title").textContent = project ? "Editar obra" : "Cadastrar obra";
  $("#project-name").value = project?.name || "";
  $("#project-address").value = project?.address || "";
  $("#project-manager").value = project?.manager || "";
  $("#project-start").value = project?.startDate || todayISO();
  $("#project-end").value = project?.endDate || "";
  $("#project-status").value = project?.status || "Em andamento";
  $("#project-notes").value = project?.notes || "";
  $("#project-error").textContent = "";
}

function openProjectForm(project = null) {
  resetProjectForm(project);
  openDialog("project-dialog");
}

function openInspectionForm(projectId = "") {
  if (!data.projects.length) {
    showToast("Cadastre uma obra antes de registrar uma vistoria.");
    openProjectForm();
    return;
  }
  $("#inspection-form").reset();
  $("#inspection-date").value = todayISO();
  $("#inspection-error").textContent = "";
  populateProjectOptions(projectId);
  openDialog("inspection-dialog");
}

function showProjectDetails(id) {
  const p = projectById(id);
  if (!p) return;
  activeDetailId = id;
  $("#detail-title").textContent = p.name;
  const inspections = data.inspections.filter(i => i.projectId === id).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  $("#project-detail-content").innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><span>ENDEREÇO</span><strong>${escapeHTML(p.address || "Não informado")}</strong></div>
      <div class="detail-item"><span>RESPONSÁVEL</span><strong>${escapeHTML(p.manager || "Não informado")}</strong></div>
      <div class="detail-item"><span>DATA DE INÍCIO</span><strong>${formatDate(p.startDate)}</strong></div>
      <div class="detail-item"><span>PREVISÃO DE CONCLUSÃO</span><strong>${formatDate(p.endDate)}</strong></div>
      <div class="detail-item"><span>SITUAÇÃO</span><strong>${escapeHTML(p.status)}</strong></div>
      <div class="detail-item"><span>VISTORIAS REGISTRADAS</span><strong>${inspections.length}</strong></div>
      <div class="detail-item" style="grid-column:1/-1"><span>DESCRIÇÃO / OBSERVAÇÕES</span><strong class="detail-notes">${escapeHTML(p.notes || "Nenhuma observação cadastrada.")}</strong></div>
    </div>
    <h3 class="detail-subheading">Histórico de vistorias</h3>
    ${inspections.length ? inspections.map(i => `<article class="inspection-detail"><div class="inspection-detail-top"><strong>${formatDate(i.date)} · ${escapeHTML(i.result)}</strong><span class="table-sub">${escapeHTML(i.inspector || "Vistoriador não informado")}</span></div><p>${escapeHTML(i.notes)}</p>${(i.photos || []).length ? `<div class="photo-gallery">${i.photos.map((src, index) => `<a href="${src}" target="_blank" rel="noopener" aria-label="Abrir foto ${index + 1}"><img src="${src}" alt="Foto ${index + 1} da vistoria" loading="lazy"></a>`).join("")}</div>` : ""}</article>`).join("") : `<div class="detail-empty">Ainda não há vistorias para esta obra.</div>`}`;
  openDialog("detail-dialog");
}

async function filesToDataUrls(fileList) {
  const files = [...fileList];
  if (files.length > 3) throw new Error("Selecione no máximo 3 fotos por vistoria.");
  if (files.some(file => !file.type.startsWith("image/"))) throw new Error("Envie somente arquivos de imagem.");
  if (files.some(file => file.size > 1024 * 1024)) throw new Error("Cada foto deve ter no máximo 1 MB.");
  return Promise.all(files.map(file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler uma das imagens."));
    reader.readAsDataURL(file);
  })));
}

$("#project-form").addEventListener("submit", event => {
  event.preventDefault();
  const id = $("#project-id").value;
  const startDate = $("#project-start").value;
  const endDate = $("#project-end").value;
  if (endDate && startDate && endDate < startDate) {
    $("#project-error").textContent = "A previsão de conclusão não pode ser anterior à data de início.";
    return;
  }
  const existing = id ? projectById(id) : null;
  const project = {
    id: id || makeId(),
    name: $("#project-name").value.trim(),
    address: $("#project-address").value.trim(),
    manager: $("#project-manager").value.trim(),
    startDate,
    endDate,
    status: $("#project-status").value,
    notes: $("#project-notes").value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString()
  };
  if (!project.name) {
    $("#project-error").textContent = "Informe o nome da obra.";
    return;
  }
  if (existing) data.projects = data.projects.map(p => p.id === id ? project : p);
  else data.projects.push(project);
  if (!saveData()) return;
  closeDialog("project-dialog");
  renderAll();
  showToast(existing ? "Obra atualizada com sucesso." : "Obra cadastrada com sucesso.");
});

$("#inspection-form").addEventListener("submit", async event => {
  event.preventDefault();
  const projectId = $("#inspection-project").value;
  const notes = $("#inspection-notes").value.trim();
  if (!projectById(projectId)) {
    $("#inspection-error").textContent = "Selecione uma obra válida.";
    return;
  }
  if (!notes) {
    $("#inspection-error").textContent = "Descreva as observações da vistoria.";
    return;
  }
  const submit = $('#inspection-form button[type="submit"]');
  submit.disabled = true;
  submit.textContent = "Salvando...";
  try {
    const photos = await filesToDataUrls($("#inspection-photos").files);
    data.inspections.push({
      id: makeId(),
      projectId,
      date: $("#inspection-date").value,
      inspector: $("#inspection-inspector").value.trim(),
      result: $("#inspection-result").value,
      notes,
      photos,
      createdAt: new Date().toISOString()
    });
    if (!saveData()) {
      data = loadData();
      return;
    }
    closeDialog("inspection-dialog");
    renderAll();
    showToast("Vistoria registrada com sucesso.");
  } catch (error) {
    $("#inspection-error").textContent = error.message || "Não foi possível salvar a vistoria.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Salvar vistoria";
  }
});

document.addEventListener("click", event => {
  const close = event.target.closest("[data-close]");
  if (close) closeDialog(close.dataset.close);

  const nav = event.target.closest("[data-view]");
  if (nav) {
    event.preventDefault();
    goToView(nav.dataset.view);
  }
  const go = event.target.closest("[data-go]");
  if (go) goToView(go.dataset.go);

  if (event.target.closest("#quick-add-btn") || event.target.closest("#banner-add-btn") || event.target.closest("#add-project-btn")) {
    openProjectForm();
  }
  if (event.target.closest("#add-inspection-btn") || event.target.closest("#shortcut-inspection")) openInspectionForm();

  const detail = event.target.closest("[data-detail]");
  if (detail) showProjectDetails(detail.dataset.detail);

  const edit = event.target.closest("[data-edit]");
  if (edit) openProjectForm(projectById(edit.dataset.edit));

  const addInspection = event.target.closest("[data-add-inspection]");
  if (addInspection) openInspectionForm(addInspection.dataset.addInspection);

  const delProject = event.target.closest("[data-delete]");
  if (delProject) {
    const project = projectById(delProject.dataset.delete);
    if (!project) return;
    if (confirm(`Excluir a obra "${project.name}" e todas as vistorias relacionadas? Essa ação não pode ser desfeita.`)) {
      data.projects = data.projects.filter(p => p.id !== project.id);
      data.inspections = data.inspections.filter(i => i.projectId !== project.id);
      saveData();
      renderAll();
      showToast("Obra e vistorias relacionadas excluídas.");
    }
  }

  const delInspection = event.target.closest("[data-delete-inspection]");
  if (delInspection && confirm("Deseja excluir esta vistoria?")) {
    data.inspections = data.inspections.filter(i => i.id !== delInspection.dataset.deleteInspection);
    saveData();
    renderAll();
    showToast("Vistoria excluída.");
  }
});

$("#detail-add-inspection").addEventListener("click", () => {
  const id = activeDetailId;
  closeDialog("detail-dialog");
  openInspectionForm(id || "");
});

$("#project-search").addEventListener("input", renderProjects);
$("#project-status-filter").addEventListener("change", renderProjects);
$("#inspection-search").addEventListener("input", renderInspections);
$("#print-report-btn").addEventListener("click", () => window.print());

$("#export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup-obracheck-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Backup exportado. Guarde o arquivo em local seguro.");
});

$("#import-file").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.inspections)) {
      throw new Error("O arquivo não parece ser um backup válido do ObraCheck.");
    }
    const validProjects = parsed.projects.every(p => p && typeof p.id === "string" && typeof p.name === "string");
    const validInspections = parsed.inspections.every(i => i && typeof i.id === "string" && typeof i.projectId === "string");
    if (!validProjects || !validInspections) throw new Error("O arquivo contém registros inválidos.");
    if (!confirm("Importar este backup substituirá os dados atuais. Deseja continuar?")) return;
    data = { projects: parsed.projects, inspections: parsed.inspections };
    if (!saveData()) return;
    renderAll();
    showToast("Backup importado com sucesso.");
  } catch (error) {
    showToast(error.message || "Não foi possível importar esse arquivo.");
  } finally {
    event.target.value = "";
  }
});

$("#today-label").textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date());

const initialView = window.location.hash.replace("#", "");
goToView(["painel", "obras", "vistorias", "relatorios"].includes(initialView) ? initialView : "painel");
renderAll();
