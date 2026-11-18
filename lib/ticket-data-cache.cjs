// One shared read for the home card and all ticket exports in this process.
function createTicketDataCache({ read, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), random = Math.random }) {
  let cached;
  let inFlight;
  let retryAt = 0;
  let lastError;
  const temporary = error => /(?:request failed: (?:429|500|502|503|504)\b)|(?:TimeoutError|AbortError)/.test(`${error.name} ${error.message}`);
  const result = () => ({ ...cached, stale: now() - cached.fetchedAt >= 60000 });
  return async function load() {
    if (cached && now() - cached.fetchedAt < 60000) return result();
    if (inFlight) return inFlight;
    if (now() < retryAt) {
      if (cached && now() - cached.fetchedAt <= 300000) return result();
      throw lastError;
    }
    inFlight = (async () => {
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const records = await read();
            cached = { records, fetchedAt: now() };
            retryAt = 0;
            return result();
          } catch (error) {
            if (!temporary(error) || attempt >= 3) throw error;
            await sleep(1000 * 2 ** attempt + Math.floor(random() * 500));
          }
        }
      } catch (error) {
        if (temporary(error)) {
          lastError = error;
          retryAt = now() + 60000;
          if (cached && now() - cached.fetchedAt <= 300000) return result();
        }
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}

module.exports = { createTicketDataCache };
