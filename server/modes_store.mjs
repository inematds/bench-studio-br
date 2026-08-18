// modes_store.mjs — modos personalizados, criados pela interface.
//
// Os modos de fábrica (Freeform, UGC, Unboxing, Hyper Motion, TV Spot, Product
// Still, Ad with Headline) vivem em `FORMATS`, no server.mjs, e os submodos em
// `SHOT_DIRECTION`, no PromptBar.jsx. São código: mudar exige editar arquivo e
// reiniciar. Isso é aceitável para quem escreveu o projeto e inútil para quem só
// quer trabalhar nele.
//
// Este arquivo guarda o que o usuário faz pela aba Modes: modos que ele cria, e
// também as MUDANÇAS nos de fábrica — um modo de fábrica editado vira um
// "override" aqui, e um escondido entra numa lista de ocultos.
//
// O de fábrica em si nunca é alterado: ele continua no código, intacto. Isso é
// o que faz "restaurar" ser possível, e faz apagar este JSON devolver o estúdio
// ao estado original — inclusive depois de você ter mexido em tudo.
//
// Um modo é: um `brief` que entra no refinador quando o modo está ativo, e uma
// lista opcional de submodos (os seletores Creator/Setting/Beat/Camera do UGC),
// cujas escolhas viram "Creative direction: ..." no fim do prompt.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const FILE_NAME = "modes.json";

function slug(value) {
  return String(value || "")
    .toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

export function createModesStore({ dataDir, isReserved = () => false }) {
  const path = join(dataDir, FILE_NAME);

  function readFile() {
    if (!existsSync(path)) return { modes: [], hidden: [] };
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      return {
        modes: Array.isArray(parsed?.modes) ? parsed.modes : [],
        hidden: Array.isArray(parsed?.hidden) ? parsed.hidden : [],
      };
    } catch (error) {
      console.warn(`modes.json ilegível (${error.message}); tratando como vazio`);
      return { modes: [], hidden: [] };
    }
  }

  function readAll() { return readFile().modes; }
  function hiddenIds() { return readFile().hidden; }

  function writeAll(modes, hidden = hiddenIds()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ modes, hidden }, null, 2));
  }

  // Validação explícita e com mensagem útil: um modo malformado só apareceria
  // como "o refinador ignorou meu modo", que é caro de diagnosticar depois.
  function normalize(input, { existingId = null } = {}) {
    const label = String(input?.label ?? "").trim();
    if (!label) throw new Error("O modo precisa de um nome.");
    const brief = String(input?.brief ?? "").trim();
    if (!brief) throw new Error("O modo precisa de uma instrução (brief): é ela que o refinador recebe.");

    const id = existingId ?? slug(input?.id || label);
    if (!id) throw new Error("Nome inválido para gerar um identificador.");
    // Editar um modo de fábrica passou a ser permitido: o resultado e um
    // override guardado aqui, com `overrides` marcando de quem. O de fabrica
    // segue intacto no codigo, e e por isso que "restaurar" funciona.
    const sobrescreve = isReserved(id);

    const controls = [];
    for (const raw of input?.controls ?? []) {
      const controlLabel = String(raw?.label ?? "").trim();
      if (!controlLabel) continue;
      const options = (raw?.options ?? [])
        .map((option) => (typeof option === "string"
          ? { value: option.trim(), label: option.trim() }
          : { value: String(option?.value ?? "").trim(), label: String(option?.label ?? option?.value ?? "").trim() }))
        .filter((option) => option.value);
      // Um seletor sem opção não seleciona nada; guardá-lo só criaria um
      // controle morto na tela.
      if (!options.length) continue;
      controls.push({ id: slug(raw?.id || controlLabel), label: controlLabel, options });
    }

    return {
      id, label, brief, controls,
      custom: !sobrescreve,
      overrides: sobrescreve ? id : null,
      updated_at: new Date().toISOString(),
    };
  }

  return {
    list: readAll,
    hidden: hiddenIds,
    save(input) {
      const modes = readAll();
      // Um id que ja existe aqui, OU que e de fabrica, e edicao — nao criacao.
      const existing = input?.id ? modes.find((m) => m.id === input.id) : null;
      const editando = existing?.id ?? (input?.id && isReserved(input.id) ? input.id : null);
      const mode = normalize(input, { existingId: editando });
      const next = existing
        ? modes.map((m) => (m.id === mode.id ? mode : m))
        : [...modes, mode];
      writeAll(next);
      return mode;
    },
    // Apagar um modo SEU o remove de vez. "Apagar" um de fabrica nao apaga
    // nada: esconde. O codigo dele continua la, e restaurar e um clique.
    remove(id) {
      const { modes, hidden } = readFile();
      if (isReserved(id)) {
        const semOverride = modes.filter((m) => m.id !== id);
        writeAll(semOverride, hidden.includes(id) ? hidden : [...hidden, id]);
        return true;
      }
      const next = modes.filter((m) => m.id !== id);
      if (next.length === modes.length) return false;
      writeAll(next, hidden);
      return true;
    },
    // Devolve um modo de fabrica ao original: tira o override e tira da lista
    // de ocultos, os dois de uma vez, porque e isso que "restaurar" significa.
    restore(id) {
      const { modes, hidden } = readFile();
      if (!isReserved(id)) return false;
      writeAll(modes.filter((m) => m.id !== id), hidden.filter((h) => h !== id));
      return true;
    },
  };
}

export default createModesStore;
