import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The first release reads one original offer between two named parties.
// Additional people and nested quoted email are a future scope, not inferred here.
export function normalizeInput(input) {
  const ourSide = String(input.ourSide || '').trim();
  const counterparty = String(input.counterparty || '').trim();
  if (!ourSide || !counterparty || ourSide === counterparty) throw new Error('Name two distinct parties.');
  if (ourSide.length > 100 || counterparty.length > 100) throw new Error('Keep party names under 100 characters.');
  if (!Array.isArray(input.messages) || input.messages.length < 2 || input.messages.length > 8) {
    throw new Error('Use an original offer and one to seven follow-up messages.');
  }
  const messages = input.messages.map(message => {
    const author = String(message.author || '').trim();
    const text = String(message.text || '').trim();
    if (![ourSide, counterparty].includes(author)) throw new Error('Assign every message to one of the two parties.');
    if (!text || text.length > 4000) throw new Error('Keep each message between 1 and 4,000 characters.');
    return { author, text };
  });
  if (!messages.slice(1).some(message => message.author !== messages[0].author)) {
    throw new Error('Add a reply from the other party.');
  }
  return { ourSide, counterparty, messages };
}

export function sourceText(input) {
  return input.messages.map((message, index) => `Message ${index + 1}. From: ${message.author}.\n${message.text}`).join('\n\n');
}

export function buildRequests(rawInput) {
  const input = normalizeInput(rawInput);
  const text = sourceText(input);
  const responder = input.messages.find(message => message.author !== input.messages[0].author).author;
  const replyNumber = input.messages.findLastIndex(message => message.author === responder) + 1;
  const paymentOptions = {
    [input.ourSide]: `${input.ourSide} pays ${input.counterparty}.`,
    [input.counterparty]: `${input.counterparty} pays ${input.ourSide}.`,
    'not established': 'No payer is established in the message being assessed.'
  };
  const policy = `Message 1 is the original offer. Assess that transaction. Message ${replyNumber}, from ${responder}, is the latest response. Explicit rejection or declining the original offer takes priority: choose declined even when the reply also describes a different payment direction. Otherwise a different price, scope, or payment direction is a counteroffer. A request for information leaves acceptance open. Quote original terms only from Message 1 and reply evidence only from Message ${replyNumber}; preserve absent terms as null.`;
  return {
    decide: {
      state: text, instructions: policy,
      questions: {
        status: { type: 'choice', instructions: `How does ${responder}'s latest reply respond to the original offer?`, criteria: {
          agreed: 'Explicitly accepts the original work, price, and payment direction.',
          clarify: 'Asks questions, postpones a decision, or leaves acceptance open.',
          declined: 'Rejects or declines the original offer.',
          counteroffer: 'Proposes different terms or understands payment in the opposite direction, with acceptance of the original offer still open. An explicit rejection takes the declined route.'
        } },
        payer: { type: 'choice', instructions: 'Who is proposed to pay in the first message, the original offer?', criteria: paymentOptions },
        reply_payer: { type: 'choice', instructions: `Who is understood to pay in the latest message from ${responder}? Read this reply itself. If it gives no payment direction, choose not established.`, criteria: paymentOptions }
      }
    },
    extract: {
      text, instructions: policy,
      fields: {
        payment_clause: 'The original offer\'s short phrase stating who pays whom and the price, ending at the currency.',
        reply_evidence: `A short verbatim phrase in ${responder}'s latest reply accepting, declining, or postponing the original offer; at most twelve words.`,
        reply_payment_clause: `A short phrase only in Message ${replyNumber}, from ${responder}, naming who will pay whom and the price. Its positions must point into that reply, including when Message 1 contains the same words. Return null when absent.`
      }
    },
    fill: {
      text, instructions: policy,
      fields: {
        payer: { type: 'extract', description: 'The organization that pays in the original offer', infer: false },
        payee: { type: 'extract', description: 'The organization paid in the original offer', infer: false },
        price: { type: 'extract', description: 'The original offer\'s price including the stated currency', infer: false },
        scope: { type: 'extract', description: 'The short phrase identifying the work offered in the first message', infer: false },
        buyer_accepts: { type: 'yes_no', description: `Does ${responder} explicitly accept the original work, price, and direction of payment? A different transaction is not acceptance of this offer.` }
      }
    }
  };
}

export async function callClocked(input, key) {
  const requests = buildRequests(input);
  // Node's native HTTP client receives WAF HTML on this API. The documented
  // Python requests transport succeeds; keep this correction in the one caller.
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.CLOCKED_PYTHON || 'python3', [fileURLToPath(new URL('./clocked.py', import.meta.url))]);
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error(error.trim() || 'Clocked request failed.'));
      try { resolve(JSON.parse(output)); } catch { reject(new Error('Clocked transport returned an invalid response.')); }
    });
    child.stdin.end(JSON.stringify({ key, requests }));
  });
}

export function verbatim(source, field) {
  if (!field || field.value === null) return null;
  const points = Array.from(source);
  if (typeof field.value !== 'string' || !Number.isInteger(field.start) || !Number.isInteger(field.end)
      || field.start < 0 || field.end <= field.start || field.end > points.length
      || points.slice(field.start, field.end).join('') !== field.value) return null;
  return { value: field.value, start: field.start, end: field.end };
}

function publicResponse(response) {
  const { usage, timing, ...outputs } = response;
  return outputs;
}

export function reviewRecords(rawInput, records) {
  const input = normalizeInput(rawInput);
  const source = records.extract.request.text;
  const evidence = [];
  const invalid = [];
  const authors = [...source.matchAll(/Message \d+\. From: ([^\n]+)\.\n/g)].map(match => ({
    start: Array.from(source.slice(0, match.index)).length,
    bodyStart: Array.from(source.slice(0, match.index + match[0].length)).length,
    author: match[1]
  }));
  const messageAt = start => {
    return authors.findLastIndex(author => author.start <= start);
  };
  const replyIndex = input.messages.findLastIndex(message => message.author !== input.messages[0].author);
  const read = (id, label, field, messageIndex = 0) => {
    let span = verbatim(source, field);
    // Repeated words can match exactly while pointing into the wrong message.
    // Relocate only a unique, identical quote inside the required message body.
    // Ambiguous repetitions remain a source gap; broader quote resolution is future scope.
    if (span && (messageAt(span.start) !== messageIndex || messageAt(span.end - 1) !== messageIndex)) {
      const body = input.messages[messageIndex].text;
      const at = body.indexOf(span.value);
      if (at >= 0 && body.lastIndexOf(span.value) === at) {
        const start = authors[messageIndex].bodyStart + Array.from(body.slice(0, at)).length;
        span = { ...span, start, end: start + Array.from(span.value).length, positionAdjusted: true };
      } else span = null;
    }
    if (field?.value !== null && field?.value !== undefined && !span) invalid.push(label);
    if (span) evidence.push({ id, label, ...span, author: authors[messageIndex].author });
    return span?.value || null;
  };
  const extracted = records.extract.response.fields || {};
  read('payment', 'Original payment', extracted.payment_clause);
  const replyEvidence = read('reply', 'Reply', extracted.reply_evidence, replyIndex);
  read('reply-payment', 'Reply payment', extracted.reply_payment_clause, replyIndex);
  const filled = records.fill.response.fields || {};
  const filledPayer = read('payer', 'Payer', filled.payer);
  const payee = read('payee', 'Payee', filled.payee);
  const price = read('price', 'Price', filled.price);
  const scope = read('scope', 'Work', filled.scope);
  const answers = records.decide.response.answers || {};
  const parties = [input.ourSide, input.counterparty];
  const payer = parties.includes(answers.payer?.choice) ? answers.payer.choice : null;
  const replyPayer = parties.includes(answers.reply_payer?.choice) ? answers.reply_payer.choice : null;
  const status = answers.status?.choice || 'clarify';
  const accepted = filled.buyer_accepts?.value === true;
  const complete = Boolean(payer && payee && parties.includes(payee) && payer !== payee
    && filledPayer === payer && price && /\d/.test(price) && scope && !invalid.length);
  const directionConflict = Boolean(payer && replyPayer && payer !== replyPayer);
  let kind = 'clarify';
  if (status === 'declined') kind = 'declined';
  else if (!complete || (status === 'agreed' && accepted && !replyEvidence)) kind = 'incomplete';
  else if (directionConflict || status === 'counteroffer') kind = 'conflict';
  else if (status === 'agreed' && accepted) kind = 'agreed';
  return {
    kind, status, payer, payee, replyPayer, price, scope, accepted, complete,
    evidence, source, endpoints: ['decide', 'extract', 'fill'],
    issues: invalid,
    raw: Object.fromEntries(Object.entries(records).map(([endpoint, record]) => [endpoint, {
      requestId: record.requestId, request: record.request, response: publicResponse(record.response)
    }]))
  };
}
