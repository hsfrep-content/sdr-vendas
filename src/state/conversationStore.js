const fs = require('fs');
const path = require('path');

// Estado por contato persistido em disco (JSON), para sobreviver a reinícios do processo
// e garantir que o fluxo automático não reenvie a mensagem inicial nem insista após handoff.
class ConversationStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      throw err;
    }
  }

  _persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get(whatsappId) {
    return this.data[whatsappId] || null;
  }

  has(whatsappId) {
    return Boolean(this.data[whatsappId]);
  }

  set(whatsappId, patch) {
    const current = this.get(whatsappId) || {};
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    this.data[whatsappId] = updated;
    this._persist();
    return updated;
  }

  // Usado só pelo painel web para montar um resumo (quantos contatos em cada etapa).
  values() {
    return Object.values(this.data);
  }
}

module.exports = { ConversationStore };
