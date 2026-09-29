const STORAGE_KEY = "er-studio-diagram-v2";
const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 1000;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

const esempio = {
  nodes: [
    { id: "meccanico", type: "entity", title: "MECCANICO", attrs: ["Codice", "Nome", "Cognome"], attrsSide: "left", x: 170, y: 70 },
    { id: "officina", type: "entity", title: "OFFICINA", attrs: ["Nome", "Telefono", "Indirizzo", "  Via", "  Località", "  CAP"], attrsSide: "left", x: 170, y: 420 },
    { id: "intervento", type: "entity", title: "INTERVENTO", attrs: [], x: 540, y: 265 },
    { id: "cliente", type: "entity", title: "CLIENTE", attrs: ["Codice Fiscale", "Cognome", "Nome", "Telefono"], attrsSide: "right", x: 1170, y: 80 },
    { id: "automobile", type: "entity", title: "AUTOMOBILE", attrs: ["Targa", "Marca", "Modello"], attrsSide: "right", x: 1170, y: 440 },
    { id: "pezzo", type: "entity", title: "PEZZO DI RICAMBIO", attrs: ["Codice", "Prezzo unitario", "Nome"], attrsSide: "left", x: 870, y: 680 },
    { id: "assegnato", type: "relation", title: "ASSEGNATO A", x: 410, y: 65, ends: [{ entityId: "meccanico", cardinality: "(1,N)" }, { entityId: "intervento", cardinality: "(1,1)" }] },
    { id: "lavora", type: "relation", title: "LAVORA", x: 250, y: 275, ends: [{ entityId: "meccanico", cardinality: "(1,1)" }, { entityId: "officina", cardinality: "(1,N)" }] },
    { id: "eseguito", type: "relation", title: "HA ESEGUITO", x: 440, y: 470, ends: [{ entityId: "officina", cardinality: "(1,N)" }, { entityId: "intervento", cardinality: "(1,1)" }] },
    { id: "su", type: "relation", title: "ESEGUITO SU", x: 900, y: 175, ends: [{ entityId: "intervento", cardinality: "(1,1)" }, { entityId: "automobile", cardinality: "(1,N)" }] },
    { id: "possiede", type: "relation", title: "POSSIEDE", x: 1170, y: 285, ends: [{ entityId: "cliente", cardinality: "(1,N)" }, { entityId: "automobile", cardinality: "(1,1)" }] },
    { id: "richiesto", type: "relation", title: "HA RICHIESTO", x: 850, y: 470, ends: [{ entityId: "intervento", cardinality: "(0,N)" }, { entityId: "pezzo", cardinality: "(0,N)" }] },
  ],
};

const canvas = document.getElementById("diagramCanvas");
const diagramViewport = document.getElementById("diagramViewport");
const canvasScroll = document.getElementById("canvasScroll");
const connections = document.getElementById("connections");
const inspector = document.getElementById("inspector");
const entityDialog = document.getElementById("entityDialog");
const relationDialog = document.getElementById("relationDialog");
const toast = document.getElementById("toast");
const savedLabel = document.getElementById("savedLabel");
let diagram = loadDiagram();
let selectedId = null;
let selectedAttribute = null;
let pendingRelationCreation = false;
let pendingRelationEntityIds = [];
let relationEndpointsDraft = [];
let toastTimer;
let zoom = 1;

function applyZoom() {
  canvas.style.transform = `scale(${zoom})`;
  diagramViewport.style.width = `${CANVAS_WIDTH * zoom}px`;
  diagramViewport.style.height = `${CANVAS_HEIGHT * zoom}px`;
  document.getElementById("zoomLevel").textContent = `${Math.round(zoom * 100)}%`;
  document.getElementById("zoomOutButton").disabled = zoom <= MIN_ZOOM;
  document.getElementById("zoomInButton").disabled = zoom >= MAX_ZOOM;
}

function changeZoom(amount) {
  const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((zoom + amount) * 10) / 10));
  if (nextZoom === zoom) return;
  const ratio = nextZoom / zoom;
  const centerX = canvasScroll.clientWidth / 2;
  const centerY = canvasScroll.clientHeight / 2;
  canvasScroll.scrollLeft = Math.max(0, (canvasScroll.scrollLeft + centerX) * ratio - centerX);
  canvasScroll.scrollTop = Math.max(0, (canvasScroll.scrollTop + centerY) * ratio - centerY);
  zoom = nextZoom;
  applyZoom();
}

document.getElementById("zoomInButton").addEventListener("click", () => changeZoom(ZOOM_STEP));
document.getElementById("zoomOutButton").addEventListener("click", () => changeZoom(-ZOOM_STEP));

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    const dialog = button.dataset.closeDialog === "entity" ? entityDialog : relationDialog;
    dialog.close();
  });
});

relationDialog.addEventListener("close", () => {
  relationEndpointsDraft = [];
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadDiagram() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.nodes)) return parsed;
    }
  } catch (error) {
    console.warn("Impossibile leggere il diagramma salvato.", error);
  }
  return clone(esempio);
}

function makeId(prefix) {
  const randomPart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${randomPart}`;
}

function saveDiagram() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(diagram));
    savedLabel.textContent = "Salvato";
  } catch (error) {
    savedLabel.textContent = "Non salvato";
    showToast("Il browser non è riuscito a salvare il diagramma.");
    console.error(error);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2300);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function entityHeight(node) {
  return 45;
}

function getCenter(node) {
  if (node.type === "relation") return { x: node.x + 87, y: node.y + 44 };
  return { x: node.x + 101, y: node.y + entityHeight(node) / 2 };
}

function inferRelationCardinality(ends = []) {
  const maximums = ends.map((end) => String(end.cardinality ?? "").match(/,\s*(N|\d+)\)/)?.[1]);
  const hasMany = maximums.filter((maximum) => maximum === "N").length;
  if (hasMany > 1) return "(N,N)";
  if (hasMany === 1) return "(1,N)";
  return "(1,1)";
}

function getAttributeEntries(node) {
  const entries = [];
  let parentIndex = null;
  (node.attrs ?? []).forEach((attribute) => {
    const value = String(attribute);
    if (!value.trim()) return;
    if (/^\s/.test(value) && parentIndex !== null) {
      entries.push({ name: value.trim(), parentIndex });
    } else {
      parentIndex = entries.length;
      entries.push({ name: value.trim(), parentIndex: null });
    }
  });
  return entries;
}

function getAttributePosition(entity, index, count, isChild) {
  const savedPosition = entity.attrPositions?.[index];
  if (savedPosition) {
    const x = entity.x + savedPosition.dx;
    return { x, y: entity.y + savedPosition.dy, side: x + 75 < entity.x + 101 ? "left" : "right" };
  }
  const side = entity.attrsSide === "left" ? "left" : "right";
  const baseX = side === "left"
    ? Math.max(12, entity.x - 150)
    : Math.min(CANVAS_WIDTH - 165, entity.x + 215);
  const y = entity.y + 22 + (index - (count - 1) / 2) * 32;
  const x = isChild
    ? Math.max(8, Math.min(CANVAS_WIDTH - 165, baseX + (side === "left" ? -22 : 22)))
    : baseX;
  return { x, y, side };
}

function renderCanvas() {
  canvas.querySelectorAll(".diagram-node, .attribute-node").forEach((node) => node.remove());
  diagram.nodes.forEach((node) => {
    const element = document.createElement("div");
    element.className = `diagram-node ${node.type}-node${selectedId === node.id ? " selected" : ""}`;
    element.dataset.id = node.id;
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;

    if (node.type === "entity") {
      element.innerHTML = `<div class="entity-name">${escapeHtml(node.title)}</div>`;
    } else {
      element.innerHTML = `<div class="relation-diamond"></div><div class="relation-content"><div class="relation-name">${escapeHtml(node.title)}</div><div class="relation-cardinality">${escapeHtml(node.relationCardinality ?? inferRelationCardinality(node.ends))}</div></div>`;
    }
    canvas.appendChild(element);
  });

  diagram.nodes.filter((node) => node.type === "entity").forEach((entity) => {
    const entries = getAttributeEntries(entity);
    entries.forEach((entry, index) => {
      const position = getAttributePosition(entity, index, entries.length, entry.parentIndex !== null);
      const attribute = document.createElement("div");
      const isSelected = selectedAttribute?.ownerId === entity.id && selectedAttribute.index === index;
      const isPrimaryKey = Array.isArray(entity.primaryKeys) && entity.primaryKeys.includes(index);
      attribute.className = `attribute-node${entry.parentIndex !== null ? " sub-attribute" : ""}${isSelected ? " selected" : ""}${isPrimaryKey ? " primary-key" : ""}`;
      attribute.dataset.ownerId = entity.id;
      attribute.dataset.attributeIndex = String(index);
      attribute.style.left = `${position.x}px`;
      attribute.style.top = `${position.y - 13}px`;
      attribute.innerHTML = `<span class="attribute-label">${escapeHtml(entry.name)}</span>${isPrimaryKey ? '<span class="primary-key-badge">PK</span>' : ""}`;
      attribute.title = "Trascina per riposizionare · fai clic per selezionare";
      canvas.appendChild(attribute);
    });
  });
  drawConnections();
  document.getElementById("elementCount").textContent = `${diagram.nodes.length} elementi`;
}

function drawConnections() {
  connections.replaceChildren();
  const svgNamespace = "http://www.w3.org/2000/svg";
  const entities = new Map(diagram.nodes.filter((node) => node.type === "entity").map((node) => [node.id, node]));
  const appendLine = (x1, y1, x2, y2, className = "connector") => {
    const line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("class", className);
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    connections.appendChild(line);
  };

  diagram.nodes.filter((node) => node.type === "relation").forEach((relation) => {
    const relationCenter = getCenter(relation);
    (relation.ends ?? []).forEach((end) => {
      const entity = entities.get(end.entityId);
      if (!entity) return;
      const entityCenter = getCenter(entity);
      appendLine(relationCenter.x, relationCenter.y, entityCenter.x, entityCenter.y);

      const label = document.createElementNS(svgNamespace, "text");
      label.setAttribute("class", "cardinality");
      const deltaX = entityCenter.x - relationCenter.x;
      const deltaY = entityCenter.y - relationCenter.y;
      const labelPosition = 0.5;
      label.setAttribute("x", String(relationCenter.x + deltaX * labelPosition));
      label.setAttribute("y", String(relationCenter.y + deltaY * labelPosition));
      label.textContent = end.cardinality || "(1,N)";
      connections.appendChild(label);
    });
  });

  diagram.nodes.filter((node) => node.type === "entity").forEach((entity) => {
    const entries = getAttributeEntries(entity);
    const entityCenter = getCenter(entity);
    entries.forEach((entry, index) => {
      const attribute = [...canvas.querySelectorAll(".attribute-node")].find(
        (element) => element.dataset.ownerId === entity.id && Number(element.dataset.attributeIndex) === index
      );
      if (!attribute) return;
      const position = getAttributePosition(entity, index, entries.length, entry.parentIndex !== null);
      const attributeCenter = { x: position.x + attribute.offsetWidth / 2, y: position.y };
      if (entry.parentIndex === null) {
        const entityEdgeX = entity.x + (position.side === "left" ? 0 : 202);
        appendLine(entityEdgeX, entityCenter.y, attributeCenter.x, attributeCenter.y, "attribute-connector");
      } else {
        const parentPosition = getAttributePosition(entity, entry.parentIndex, entries.length, false);
        const parentElement = [...canvas.querySelectorAll(".attribute-node")].find(
          (element) => element.dataset.ownerId === entity.id && Number(element.dataset.attributeIndex) === entry.parentIndex
        );
        const parentCenter = {
          x: parentPosition.x + (parentElement?.offsetWidth ?? 0) / 2,
          y: parentPosition.y,
        };
        appendLine(parentCenter.x, parentCenter.y, attributeCenter.x, attributeCenter.y, "attribute-connector");
      }
    });
  });
}

function renderInspector() {
  const selected = diagram.nodes.find((node) => node.id === selectedId);
  if (!selected) {
    inspector.innerHTML = `<div class="inspector-empty"><strong>Nessun elemento selezionato</strong><p>Seleziona un’entità o una relazione nel foglio per modificarne le proprietà.</p></div>`;
    return;
  }

  if (selected.type === "entity") {
    const entries = getAttributeEntries(selected);
    const selectedEntry = selectedAttribute?.ownerId === selected.id ? entries[selectedAttribute.index] : null;
    const primaryKeys = Array.isArray(selected.primaryKeys) ? selected.primaryKeys : [];
    const isPrimaryKey = selectedAttribute?.ownerId === selected.id && primaryKeys.includes(selectedAttribute.index);
    inspector.innerHTML = `
      <div class="inspector-title"><span>Proprietà elemento</span><span class="selection-type">ENTITÀ</span></div>
      <label class="field-label">Nome<input data-property="title" maxlength="48" value="${escapeHtml(selected.title)}" /></label>
      <label class="field-label">Attributi <span>rientra i sotto-attributi</span><textarea data-property="attrs" rows="6">${escapeHtml((selected.attrs ?? []).join("\n"))}</textarea></label>
      ${selectedEntry ? `<div class="key-editor"><div><span>Attributo selezionato</span><strong>${escapeHtml(selectedEntry.name)}</strong></div><button class="key-toggle" type="button" data-action="toggle-primary-key">${isPrimaryKey ? "Rimuovi chiave primaria" : "Imposta come chiave primaria"}</button></div>` : '<p class="key-hint">Seleziona un ovale attributo per impostarlo come chiave primaria.</p>'}
      <button class="inspector-delete" type="button" data-action="delete">Elimina entità</button>`;
  } else {
    const ends = selected.ends ?? [];
    const linkedEntities = ends.map((end) => {
      const entity = diagram.nodes.find((node) => node.id === end.entityId);
      return escapeHtml(entity?.title ?? "Entità non trovata");
    }).join(" ↔ ");
    const cardinalityField = (index) => `
      <label class="field-label">Cardinalità ${index === 0 ? "Diretta" : "Inversa"}
        <select data-end="${index}" data-end-property="cardinality">
          ${["(1,1)", "(0,1)", "(1,N)", "(0,N)"].map((value) => `<option>${value}</option>`).join("")}
        </select>
      </label>`;
    inspector.innerHTML = `
      <div class="inspector-title"><span>Proprietà elemento</span><span class="selection-type">RELAZIONE</span></div>
      <label class="field-label">Nome<input data-property="title" maxlength="48" value="${escapeHtml(selected.title)}" /></label>
      <div class="relation-endpoints"><span>Entità collegate</span><strong>${linkedEntities}</strong></div>
      <div class="relation-pair">${cardinalityField(0)}${cardinalityField(1)}</div>
      <label class="field-label">Cardinalità della relazione
        <select data-property="relationCardinality">
          ${["(1,1)", "(1,N)", "(N,N)"].map((value) => `<option>${value}</option>`).join("")}
        </select>
      </label>
      <button class="inspector-delete" type="button" data-action="delete">Elimina relazione</button>`;
    inspector.querySelectorAll("select[data-end]").forEach((select) => {
      const index = Number(select.dataset.end);
      select.value = ends[index]?.cardinality ?? "";
    });
    inspector.querySelector('[data-property="relationCardinality"]').value = selected.relationCardinality ?? inferRelationCardinality(ends);
  }
}

function render() {
  renderCanvas();
  renderInspector();
  saveDiagram();
}

function setRelationSelectionMode(active) {
  pendingRelationCreation = active;
  pendingRelationEntityIds = [];
  const button = document.getElementById("addRelationButton");
  button.classList.toggle("is-active", active);
  button.querySelector("strong").textContent = active ? "Seleziona entità" : "Nuova relazione";
  button.querySelector("small").textContent = active ? "Clicca due entità sul foglio" : "Collega due entità";
  button.querySelector(".plus").textContent = active ? "0/2" : "+";
}

function openRelationDialog(entityIds) {
  relationEndpointsDraft = [...entityIds];
  document.getElementById("relationForm").reset();
  const selectedEntities = entityIds.map((id) => diagram.nodes.find((node) => node.id === id)?.title ?? "Entità non trovata");
  document.getElementById("relationEndpointsPreview").textContent = selectedEntities.join(" ↔ ");
  relationDialog.showModal();
  document.getElementById("relationName").focus();
}

function addEntity(name, attributes) {
  const cleanName = name.trim();
  if (!cleanName) return;
  const node = { id: makeId("entity"), type: "entity", title: cleanName, attrs: attributes.split("\n").map((item) => item.replace(/\t/g, "  ")).filter((item) => item.trim()), attrsSide: "right", x: 650, y: 360 };
  diagram.nodes.push(node);
  selectedId = node.id;
  render();
  showToast(`Entità “${cleanName}” creata`);
}

function addRelation(name, entityA, cardinalityA, entityB, cardinalityB, relationCardinality) {
  if (!entityA || !entityB || entityA === entityB) {
    showToast("Scegli due entità diverse per collegare la relazione.");
    return false;
  }
  const node = {
    id: makeId("relation"), type: "relation", title: name.trim(), x: 700, y: 430,
    ends: [{ entityId: entityA, cardinality: cardinalityA }, { entityId: entityB, cardinality: cardinalityB }],
    relationCardinality,
  };
  diagram.nodes.push(node);
  selectedId = node.id;
  render();
  showToast(`Relazione “${node.title}” creata`);
  return true;
}

document.getElementById("addEntityButton").addEventListener("click", () => {
  document.getElementById("entityForm").reset();
  entityDialog.showModal();
  document.getElementById("entityName").focus();
});

document.getElementById("entityForm").addEventListener("submit", (event) => {
  event.preventDefault();
  addEntity(document.getElementById("entityName").value, document.getElementById("entityAttributes").value);
  entityDialog.close();
});

document.getElementById("addRelationButton").addEventListener("click", () => {
  if (pendingRelationCreation) {
    setRelationSelectionMode(false);
    showToast("Creazione della relazione annullata");
    return;
  }
  if (diagram.nodes.filter((node) => node.type === "entity").length < 2) {
    showToast("Aggiungi almeno due entità prima di creare una relazione.");
    return;
  }
  setRelationSelectionMode(true);
  showToast("Clicca sul foglio la prima entità e poi la seconda.");
});

document.getElementById("relationForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (relationEndpointsDraft.length !== 2) {
    showToast("Seleziona prima due entità sul foglio.");
    relationDialog.close();
    return;
  }
  const created = addRelation(
    document.getElementById("relationName").value,
    relationEndpointsDraft[0],
    document.getElementById("relationCardinalityA").value,
    relationEndpointsDraft[1],
    document.getElementById("relationCardinalityB").value,
    document.getElementById("relationOverallCardinality").value,
  );
  if (created) {
    relationEndpointsDraft = [];
    relationDialog.close();
  }
});

inspector.addEventListener("input", (event) => {
  const target = event.target;
  const selected = diagram.nodes.find((node) => node.id === selectedId);
  if (!selected || !target.dataset.property) return;
  const property = target.dataset.property;
  if (property === "attrs") {
    selected.attrs = target.value.split("\n").map((item) => item.replace(/\t/g, "  ")).filter((item) => item.trim());
    selected.attrPositions = {};
    selected.primaryKeys = [];
  } else {
    if (property === "attrsSide") selected.attrPositions = {};
    selected[property] = target.value;
  }
  renderCanvas();
  saveDiagram();
});

inspector.addEventListener("change", (event) => {
  const target = event.target;
  const selected = diagram.nodes.find((node) => node.id === selectedId);
  if (!selected) return;
  if (target.dataset.property) {
    if (target.dataset.property === "attrsSide") selected.attrPositions = {};
    selected[target.dataset.property] = target.value;
    renderCanvas();
    saveDiagram();
    return;
  }
  if (target.dataset.end === undefined) return;
  const index = Number(target.dataset.end);
  selected.ends[index][target.dataset.endProperty] = target.value;
  if (target.dataset.endProperty === "entityId" && selected.ends[0].entityId === selected.ends[1].entityId) {
    selected.ends[1].entityId = diagram.nodes.find((node) => node.type === "entity" && node.id !== target.value)?.id ?? target.value;
    inspector.querySelector(`select[data-end="1"][data-end-property="entityId"]`).value = selected.ends[1].entityId;
  }
  renderCanvas();
  saveDiagram();
});

inspector.addEventListener("click", (event) => {
  if (event.target.dataset.action === "toggle-primary-key") {
    const entity = diagram.nodes.find((node) => node.id === selectedId && node.type === "entity");
    if (!entity || selectedAttribute?.ownerId !== entity.id) return;
    entity.primaryKeys = Array.isArray(entity.primaryKeys) ? entity.primaryKeys : [];
    if (entity.primaryKeys.includes(selectedAttribute.index)) {
      entity.primaryKeys = entity.primaryKeys.filter((index) => index !== selectedAttribute.index);
      showToast("Chiave primaria rimossa");
    } else {
      entity.primaryKeys.push(selectedAttribute.index);
      showToast("Chiave primaria evidenziata");
    }
    renderCanvas();
    renderInspector();
    saveDiagram();
    return;
  }
  if (event.target.dataset.action !== "delete") return;
  const target = diagram.nodes.find((node) => node.id === selectedId);
  if (!target) return;
  if (target.type === "entity") {
    diagram.nodes = diagram.nodes.filter((node) => node.id !== target.id && !(node.type === "relation" && node.ends.some((end) => end.entityId === target.id)));
  } else {
    diagram.nodes = diagram.nodes.filter((node) => node.id !== target.id);
  }
  selectedId = null;
  render();
  showToast("Elemento eliminato dal diagramma");
});

canvas.addEventListener("click", (event) => {
  const nodeElement = event.target.closest(".diagram-node");
  const attributeElement = event.target.closest(".attribute-node");
  if (pendingRelationCreation) {
    if (!nodeElement?.classList.contains("entity-node")) {
      showToast("Seleziona il riquadro di un’entità.");
      return;
    }
    const entityId = nodeElement.dataset.id;
    if (pendingRelationEntityIds.includes(entityId)) {
      showToast("Scegli due entità diverse.");
      return;
    }
    pendingRelationEntityIds.push(entityId);
    const button = document.getElementById("addRelationButton");
    button.querySelector(".plus").textContent = `${pendingRelationEntityIds.length}/2`;
    if (pendingRelationEntityIds.length === 1) {
      showToast("Prima entità selezionata. Ora clicca la seconda.");
    } else {
      const endpoints = [...pendingRelationEntityIds];
      setRelationSelectionMode(false);
      openRelationDialog(endpoints);
    }
    return;
  }
  if (!nodeElement && !attributeElement) {
    if (selectedId) { selectedId = null; selectedAttribute = null; render(); }
    return;
  }
  const id = nodeElement?.dataset.id ?? attributeElement.dataset.ownerId;
  const nextAttribute = attributeElement
    ? { ownerId: attributeElement.dataset.ownerId, index: Number(attributeElement.dataset.attributeIndex) }
    : null;
  if (selectedId !== id || selectedAttribute?.ownerId !== nextAttribute?.ownerId || selectedAttribute?.index !== nextAttribute?.index) {
    selectedId = id;
    selectedAttribute = nextAttribute;
    renderCanvas();
    renderInspector();
  }
});

let dragState = null;
canvas.addEventListener("pointerdown", (event) => {
  const attributeElement = event.target.closest(".attribute-node");
  if (attributeElement && event.button === 0) {
    const owner = diagram.nodes.find((item) => item.id === attributeElement.dataset.ownerId);
    const index = Number(attributeElement.dataset.attributeIndex);
    if (!owner) return;
    const position = getAttributePosition(owner, index, getAttributeEntries(owner).length, getAttributeEntries(owner)[index]?.parentIndex !== null);
    selectedId = owner.id;
    selectedAttribute = { ownerId: owner.id, index };
    canvas.querySelectorAll(".attribute-node.selected").forEach((element) => element.classList.remove("selected"));
    attributeElement.classList.add("selected");
    canvas.querySelectorAll(".entity-node").forEach((element) => element.classList.toggle("selected", element.dataset.id === owner.id));
    renderInspector();
    dragState = {
      kind: "attribute", node: owner, index, element: attributeElement,
      startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y,
      currentX: position.x, currentY: position.y,
    };
    attributeElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const element = event.target.closest(".diagram-node");
  if (!element || event.button !== 0) return;
  const node = diagram.nodes.find((item) => item.id === element.dataset.id);
  if (!node) return;
  selectedId = node.id;
  selectedAttribute = null;
  renderInspector();
  dragState = { kind: "node", node, element, startX: event.clientX, startY: event.clientY, originX: node.x, originY: node.y };
  element.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragState) return;
  const scaleX = canvas.getBoundingClientRect().width / CANVAS_WIDTH;
  const scaleY = canvas.getBoundingClientRect().height / CANVAS_HEIGHT;
  if (dragState.kind === "attribute") {
    const nextX = Math.max(0, Math.min(CANVAS_WIDTH - dragState.element.offsetWidth, dragState.originX + (event.clientX - dragState.startX) / scaleX));
    const nextY = Math.max(13, Math.min(CANVAS_HEIGHT - 13, dragState.originY + (event.clientY - dragState.startY) / scaleY));
    dragState.currentX = nextX;
    dragState.currentY = nextY;
    dragState.node.attrPositions ??= {};
    dragState.node.attrPositions[dragState.index] = { dx: nextX - dragState.node.x, dy: nextY - dragState.node.y };
    dragState.element.style.left = `${nextX}px`;
    dragState.element.style.top = `${nextY - 13}px`;
    drawConnections();
    return;
  }
  dragState.node.x = Math.max(0, Math.min(CANVAS_WIDTH - 210, dragState.originX + (event.clientX - dragState.startX) / scaleX));
  dragState.node.y = Math.max(0, Math.min(CANVAS_HEIGHT - 105, dragState.originY + (event.clientY - dragState.startY) / scaleY));
  dragState.element.style.left = `${dragState.node.x}px`;
  dragState.element.style.top = `${dragState.node.y}px`;
  if (dragState.node.type === "entity") {
    const entries = getAttributeEntries(dragState.node);
    canvas.querySelectorAll(".attribute-node").forEach((attribute) => {
      if (attribute.dataset.ownerId !== dragState.node.id) return;
      const index = Number(attribute.dataset.attributeIndex);
      const position = getAttributePosition(dragState.node, index, entries.length, entries[index]?.parentIndex !== null);
      attribute.style.left = `${position.x}px`;
      attribute.style.top = `${position.y - 13}px`;
    });
  }
  drawConnections();
});
function finishDrag() {
  if (!dragState) return;
  const moved = dragState.kind === "attribute"
    ? Math.abs(dragState.currentX - dragState.originX) + Math.abs(dragState.currentY - dragState.originY) > 1
    : Math.abs(dragState.node.x - dragState.originX) + Math.abs(dragState.node.y - dragState.originY) > 1;
  dragState = null;
  if (moved) saveDiagram();
}
canvas.addEventListener("pointerup", finishDrag);
canvas.addEventListener("pointercancel", finishDrag);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pendingRelationCreation) {
    setRelationSelectionMode(false);
    showToast("Creazione della relazione annullata");
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    inspector.querySelector('[data-action="delete"]')?.click();
  }
});

document.getElementById("resetButton").addEventListener("click", () => {
  diagram = clone(esempio);
  selectedId = null;
  selectedAttribute = null;
  render();
  showToast("Diagramma di esempio ripristinato");
});

document.getElementById("printButton").addEventListener("click", () => window.print());
document.getElementById("exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(diagram, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "diagramma-er.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Diagramma esportato in formato JSON");
});

document.getElementById("importButton").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.nodes) || parsed.nodes.some((node) => !node.id || !["entity", "relation"].includes(node.type) || typeof node.title !== "string")) {
      throw new Error("Formato del diagramma non valido");
    }
    diagram = parsed;
    selectedId = null;
    selectedAttribute = null;
    render();
    showToast("Diagramma importato correttamente");
  } catch (error) {
    showToast("File non valido: scegli un diagramma ER Studio in formato JSON.");
  }
  event.target.value = "";
});

render();
applyZoom();
