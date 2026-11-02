# Counterparty Desk

**Know who pays whom before work starts.**

[Open the desk](https://blucca.github.io/counterparty-desk/)

[Watch the short demo](https://blucca.github.io/counterparty-desk/demo.html) — real UI interactions, including an edited $249 thread reviewed through all three live Clocked endpoints. Fictional conversations and synthetic narration.

A friendly reply can describe a different transaction from the offer. Counterparty Desk puts the original payment direction, the reply's understanding, and the exact words supporting the terms in one review surface.

## Try it

The public desk includes five recorded, fictional conversations with real Clocked API outputs:

- A declined offer whose reply also reverses the paying side.
- Explicit acceptance of the original price and work.
- A request for information before a decision.
- An enthusiastic counteroffer with the payment reversed.
- An agreed work scope with the price still open.

Choose a case, inspect its payment path, and click a term to locate its exact source. Edit the messages to prepare another review. A copied terms note requires an agreed reply, complete sourced terms, and a current review.

## Review your own thread

Requires Node 20+ and Python 3.10+.

```sh
python3 -m pip install -r requirements.txt
npm run check
CLOCKED_API_KEY='<your Clocked key>' npm start
```

Open `http://127.0.0.1:8855`. Your key stays on the local server. Set `CLOCKED_PYTHON` to a Python interpreter with `requests` installed if necessary. Clocked offers a free developer account at [clocked.rezolve.ai](https://clocked.rezolve.ai/signup?next=%2Faccount).

The first release reads one original offer between two named parties and up to seven follow-up messages. Enter the authors explicitly. The work and price are read from the first message; acceptance and payment understanding are read from the latest reply by the other party. The desk produces a source-linked review and a personal terms note.

## Three endpoints, three jobs

1. **Decide** classifies the response and separately reads the original payer and the reply's payer. The two named payer values can expose a reversed transaction.
2. **Extract** returns the original payment phrase, reply evidence, and any reply payment phrase with exact source positions. Selecting a citation highlights those Unicode code points in the source.
3. **Fill** produces the sourced payer, payee, price, work scope, and original-offer acceptance judgment. Missing terms remain visible, and an open price keeps the terms note locked.

The local contract checks that quoted values match their source positions in the original offer or the latest counterparty reply. Explicit rejection stops the offer while preserving both payment directions. Counteroffers, absent terms, and source gaps each have their own review state. The raw Clocked decision and field outputs remain inspectable beside the app's interpretation.

When Clocked points repeated words into the other message, the desk relocates the quote only if the identical text occurs exactly once in the required message body. Adjusted evidence is marked `positionAdjusted`; the original endpoint positions stay in the raw output. A missing or ambiguous match leaves a source gap.

The Python transport uses Clocked's documented JSON API. It is shared by fixture generation and the local server; Node's default HTTP client received a WAF HTML response during development.

## Reproduce the output contract

```sh
npm run check
```

This checks the five real recorded outputs, source quotations including an emoji, author ownership, the missing-price branch, and the public fixture shape. Each fixture retains its request, endpoint output, and request ID. Operational statistics remain private.

## Development and disclosure

Counterparty Desk is a new application built in November 2026 for the Clocked Build Challenge. OpenAI Codex performed the product design, code, testing, and technical writing. Blucca is the human account and payment contact. All demo conversations and names are fictional. Clocked supplies the semantic endpoint outputs. The source-position and terms-completeness checks are local application code.

MIT licensed. Demo and source remain available through the challenge's judging period.
