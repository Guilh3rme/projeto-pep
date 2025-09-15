import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS amplo para laboratório; em produção restrinja por origem.
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "128kb" }));

/** ===== Armazenamento em memória (didático) ===== */
let seq = 1;
const encounters = []; // lista de atendimentos

// Mapa de transições válidas (simplificado)
const FLOW = new Map([
    ["Triagem", new Set(["Em Atendimento"])],
    ["Em Atendimento", new Set(["Aguardando Exame", "Internado", "Alta"])],
    ["Aguardando Exame", new Set(["Em Exame"])],
    ["Em Exame", new Set(["Aguardando Resultado"])],
    ["Aguardando Resultado", new Set(["Alta", "Internado"])],
    ["Internado", new Set(["Alta"])],
    ["Alta", new Set()]
]);

app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
});

/**
 * POST /api/encounters
 * body: { paciente, cpf?, status, tipoExame?, obs? }
 */
app.post("/api/encounters", (req, res) => {
    try {
        const { paciente, cpf, status, tipoExame, obs } = req.body || {};
        const error = validateNew({ paciente, cpf, status, tipoExame });
        if (error) return res.status(400).json({ error });

        const needsExam = requiresExam(status);
        const exame = needsExam ? (tipoExame || "").trim() : undefined;

        const now = new Date().toISOString();
        const id = seq++;

        const timeline = [
            { at: now, status, by: "system", note: exame ? `exame: ${exame}` : undefined }
        ];

        const enc = {
            id,
            paciente: (paciente || "").trim(),
            cpf: normalizeCpf(cpf),
            createdAt: now,
            statusAtual: status,
            exame: exame || null,
            obs: (obs || "").trim() || null,
            timeline
        };

        encounters.push(enc);
        res.status(201).json(enc);
    } catch {
        res.status(500).json({ error: "Erro inesperado ao registrar atendimento." });
    }
});

/**
 * PATCH /api/encounters/:id/status
 * body: { status, tipoExame? }
 */
app.patch("/api/encounters/:id/status", (req, res) => {
    try {
        const id = Number(req.params.id);
        const enc = encounters.find((e) => e.id === id);
        if (!enc) return res.status(404).json({ error: "Atendimento não encontrado." });

        const { status, tipoExame } = req.body || {};
        if (!status || typeof status !== "string") {
            return res.status(400).json({ error: "Status é obrigatório." });
        }

        const allowed = FLOW.get(enc.statusAtual) || new Set();
        if (!allowed.has(status)) {
            return res.status(409).json({ error: `Transição inválida de '${enc.statusAtual}' para '${status}'.` });
        }

        if (requiresExam(status) && !(tipoExame || "").trim()) {
            return res.status(400).json({ error: "Tipo de exame é obrigatório para o status informado." });
        }

        enc.statusAtual = status;
        if (requiresExam(status)) enc.exame = (tipoExame || "").trim();
        enc.timeline.push({
            at: new Date().toISOString(),
            status,
            by: "system",
            note: requiresExam(status) ? `exame: ${enc.exame}` : undefined
        });

        res.json(enc);
    } catch {
        res.status(500).json({ error: "Erro ao atualizar status." });
    }
});

/**
 * GET /api/encounters
 */
app.get("/api/encounters", (_req, res) => {
    res.json(encounters);
});

/** ===== Helpers ===== */
function validateNew({ paciente, cpf, status, tipoExame }) {
    if (!paciente || typeof paciente !== "string" || paciente.trim().length < 3) {
        return "Nome do paciente inválido (mín. 3 caracteres).";
    }
    if (!status || typeof status !== "string" || !FLOW.has(status)) {
        return "Status inicial inválido.";
    }
    const cpfClean = normalizeCpf(cpf);
    if (cpf && cpfClean.length !== 11) {
        return "CPF inválido (use 11 dígitos ou deixe em branco).";
    }
    if (requiresExam(status) && !(tipoExame || "").trim()) {
        return "Tipo de exame é obrigatório para o status informado.";
    }
    return null;
}

function normalizeCpf(v) {
    return (v || "").toString().replace(/[^\d]/g, "");
}

function requiresExam(status) {
    return status === "Aguardando Exame" || status === "Em Exame";
}

/** ===== Start ===== */
app.listen(PORT, () => {
    console.log(`API on http://localhost:${PORT}`);
});
