// Builds the question sent to Aiana for a What's Next card's "Ask Aiana"
// button / inline spec preview. Tailored per schedule type so the answer is
// actually useful ("what type of coolant, how much") instead of a generic
// "tell me about X" that just re-describes the card.

const SCHEDULE_QUERIES: Record<string, string> = {
  oil_change: "What type and weight of engine oil does the manual recommend for this vehicle, and what's the oil capacity?",
  tire_rotation: 'What tire size does the manual recommend, and what rotation pattern should be used?',
  air_filter: 'What engine air filter part or spec does the manual recommend, and where is it located?',
  cabin_filter: 'Where is the cabin air filter located and how do I replace it? What part or spec does the manual recommend?',
  brake_fluid: 'What type of brake fluid does the manual recommend for this vehicle?',
  transmission_fluid: 'What type of transmission fluid does the manual recommend, and what is the capacity?',
  coolant: 'What type of engine coolant does the manual recommend, and how much is needed?',
  spark_plugs: 'What type of spark plugs does the manual recommend, and how many does this engine use?',
  drive_belt: 'What kind of drive belt does this vehicle use, and where can I find belt routing or replacement info in the manual?',
  brake_pads_front: 'What front brake pad specification does the manual recommend?',
  brake_pads_rear: 'What rear brake pad specification does the manual recommend?',
  battery: 'What battery group size or specification does the manual recommend for this vehicle?',
  wiper_blades: 'What wiper blade size does the manual recommend for the front and rear?',
};

export function forecastAianaQuery(type: string, name: string): string {
  return SCHEDULE_QUERIES[type] ?? `What does the owner's manual say about the ${name.toLowerCase()}?`;
}

export function reminderAianaQuery(title: string): string {
  return `Tell me what I should know about "${title}" for my vehicle, and point me to any relevant pages in the manual.`;
}

// Separate from forecastAianaQuery (used for the "Ask Aiana" deep link, which
// opens the full chat page and should get Aiana's normal markdown-formatted
// answer) — this variant is only for the inline What's Next card preview,
// which has no room for headers/bullets/bold and needs a tight answer.
const SPEC_PREVIEW_SUFFIX =
  ' Answer in 2-3 short plain sentences only, no markdown formatting — no headers, no bold, no bullet points. This is shown in a small card with limited space.';

export function forecastSpecPreviewQuery(type: string, name: string): string {
  return `${forecastAianaQuery(type, name)}${SPEC_PREVIEW_SUFFIX}`;
}

// Belt-and-suspenders: models don't always fully honor "no markdown"
// instructions, so strip common markdown tokens from the preview text too
// rather than relying on the prompt alone.
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
