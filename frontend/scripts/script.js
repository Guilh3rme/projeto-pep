// Config
const API_BASE = "http://localhost:3000/api";
const $ = (sel) => document.querySelector(sel);

const form = $("#form-atendimento");
const btnSubmit = $("#btn-submit");
const btnLimpar = $("#btn-limpar");
const btnRecarregar = $("#btn-recarregar");
const msg = $("#msg");
const tbody = $("#tbody");
const statusSel = $("#status");
const wrapExame = $("#wrap-exame");
const inputExame = $("#tipoExame");

// Regras simples: quando status exigir exame, mostrar campo
const STATUS_EXIGE_EXAME = new Set(["Aguardando Exame", "Em Exame"]);

statusSel.addEventListener("change", () => {
    const exige = STATUS_EXIGE_EXAME.has(statusSel.value);
    wrapExame.hidden = !exige;
    if (!exige) inputExame.value = "";
});

btnLimpar.addEventListener("click", () => {
    form.reset();
    wrapExame.hidden = true;
    msg.innerHTML = "";
    $("#paciente").focus();
});

btnRecarregar.addEventListener("click", () => loadTabela().catch(console.error));

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.innerHTML = "";
    const payload = coletar();

    const erro = validar(payload);
    if (erro) {
        renderMsg("err", erro);
        return;
    }

    try {
        bloqueia(true);
        const res = await fetch(`${API_BASE}/encounters`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Falha ao registrar");

        renderMsg("ok", `Atendimento #${data.id} criado para ${data.paciente}.`);
        form.reset();
        wrapExame.hidden = true;
        await loadTabela();
    } catch (err) {
        renderMsg("err", err.message);
    } finally {
        bloqueia(false);
    }
});

function coletar() {
    return {
        paciente: $("#paciente").value.trim(),
        cpf: $("#cpf").value.replace(/[^\d]/g, ""),
        status: $("#status").value,
        tipoExame: $("#tipoExame").value.trim(),
        obs: $("#obs").value.trim(),
    };
}

function validar(p) {
    if (!p.paciente || p.paciente.length < 3) return "Informe um nome válido (mín. 3 caracteres).";
    if (!p.status) return "Selecione um status inicial.";
    if (STATUS_EXIGE_EXAME.has(p.status) && !p.tipoExame) return "Informe o tipo de exame para o status selecionado.";
    if (p.cpf && p.cpf.length !== 11) return "CPF inválido (use 11 dígitos ou deixe em branco).";
    return null;
}

function renderMsg(kind, text) {
    msg.innerHTML = `<div class="${kind}">${escapeHtml(text)}</div>`;
}

function bloqueia(flag) {
    btnSubmit.disabled = flag;
    btnLimpar.disabled = flag;
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]));
}

async function loadTabela() {
    const res = await fetch(`${API_BASE}/encounters`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Erro ao carregar atendimentos");

    tbody.innerHTML = data
        .slice() // cópia para não mutar
        .reverse() // recentes primeiro
        .map((a) => {
            const dataHora = new Date(a.createdAt).toLocaleString();
            return `<tr>
        <td>${a.id}</td>
        <td>${escapeHtml(a.paciente)}</td>
        <td>${escapeHtml(a.statusAtual)}</td>
        <td>${a.exame || "-"}</td>
        <td>${dataHora}</td>
      </tr>`;
        })
        .join("");
}

// Carrega
