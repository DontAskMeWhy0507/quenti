export interface RenderCardOptions {
  qfmt: string;                          // Front template
  afmt: string;                          // Back template
  fields: Record<string, string>;        // Field name -> content
  clozeOrdinal?: number;                 // e.g. 1 for c1, 2 for c2
  mediaUrlPrefix?: string;               // e.g. "/api/anki/media/setId"
}

export interface RenderedCard {
  questionHtml: string;
  answerHtml: string;
  audioFiles: string[];
  imageFiles: string[];
}

export function extractClozeOrdinals(text: string): number[] {
  const ordinals = new Set<number>();
  const regex = /\{\{c(\d+)::/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) {
      ordinals.add(num);
    }
  }
  return Array.from(ordinals).sort((a, b) => a - b);
}

function renderCloze(text: string, targetOrdinal: number, isBack: boolean): string {
  // Pattern: {{c1::answer}} or {{c1::answer::hint}}
  const clozeRegex = /\{\{c(\d+)::(.*?)(?:::([^}]*))?\}\}/g;
  return text.replace(clozeRegex, (_match, ordStr, content, hint) => {
    const ord = parseInt(ordStr, 10);
    if (ord === targetOrdinal) {
      if (isBack) {
        return `<span class="anki-cloze">${content}</span>`;
      } else {
        return hint ? `[${hint}]` : "[...]";
      }
    } else {
      // Non-active cloze deletion is revealed as plain content
      return content;
    }
  });
}

function isFieldEmpty(val: string | undefined): boolean {
  if (!val) return true;
  const stripped = val.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return stripped.length === 0;
}

function resolveConditionals(template: string, fields: Record<string, string>): string {
  let result = template;
  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    let changed = false;

    // Positive conditional: {{#Field}}...{{/Field}}
    result = result.replace(/\{\{#([a-zA-Z0-9_ -]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, fieldName, inner) => {
      changed = true;
      const val = fields[fieldName];
      return isFieldEmpty(val) ? "" : inner;
    });

    // Inverted conditional: {{^Field}}...{{/Field}}
    result = result.replace(/\{\{\^([a-zA-Z0-9_ -]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, fieldName, inner) => {
      changed = true;
      const val = fields[fieldName];
      return isFieldEmpty(val) ? inner : "";
    });

    if (!changed) break;
    iterations++;
  }

  return result;
}

function replaceFields(
  template: string,
  fields: Record<string, string>,
  clozeOrdinal?: number,
  isBack: boolean = false
): string {
  let rendered = resolveConditionals(template, fields);

  // Replace {{cloze:FieldName}}
  rendered = rendered.replace(/\{\{cloze:([a-zA-Z0-9_ -]+)\}\}/g, (_match, fieldName) => {
    const val = fields[fieldName] ?? "";
    if (clozeOrdinal !== undefined) {
      return renderCloze(val, clozeOrdinal, isBack);
    }
    return val;
  });

  // Replace {{type:FieldName}}
  rendered = rendered.replace(/\{\{type:([a-zA-Z0-9_ -]+)\}\}/g, (_match, fieldName) => {
    const val = fields[fieldName] ?? "";
    if (!isBack) {
      return `<input class="anki-type-ans" placeholder="Type answer..." />`;
    }
    return `<div class="anki-type-result">${val}</div>`;
  });

  // Replace standard {{FieldName}}
  rendered = rendered.replace(/\{\{([a-zA-Z0-9_ -]+)\}\}/g, (_match, fieldName) => {
    return fields[fieldName] ?? "";
  });

  return rendered;
}

export function sanitizeAnkiHtml(
  rawHtml: string,
  mediaUrlPrefix: string = ""
): {
  html: string;
  audioFiles: string[];
  imageFiles: string[];
} {
  const audioSet = new Set<string>();
  const imageSet = new Set<string>();

  // Extract and replace [sound:filename.ext]
  let html = rawHtml.replace(/\[sound:([^\]]+)\]/g, (_match, filename) => {
    const cleanFile = filename.trim();
    audioSet.add(cleanFile);
    const src = mediaUrlPrefix ? `${mediaUrlPrefix}/${cleanFile}` : cleanFile;
    return `<div data-anki-sound="${cleanFile}" class="anki-audio" data-src="${src}"></div>`;
  });

  // Extract and rewrite <img src="...">
  html = html.replace(/<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (_match, pre, src, post) => {
    const cleanSrc = src.trim();
    if (!cleanSrc.startsWith("http://") && !cleanSrc.startsWith("https://") && !cleanSrc.startsWith("data:")) {
      imageSet.add(cleanSrc);
      const newSrc = mediaUrlPrefix ? `${mediaUrlPrefix}/${cleanSrc}` : cleanSrc;
      return `<img ${pre}src="${newSrc}"${post} class="anki-img" />`;
    }
    return `<img ${pre}src="${cleanSrc}"${post} class="anki-img" />`;
  });

  return {
    html,
    audioFiles: Array.from(audioSet),
    imageFiles: Array.from(imageSet),
  };
}

export function renderAnkiCard(options: RenderCardOptions): RenderedCard {
  const mediaPrefix = options.mediaUrlPrefix ?? "";

  // Render question
  const rawQuestion = replaceFields(options.qfmt, options.fields, options.clozeOrdinal, false);

  // Render answer, replacing {{FrontSide}} if present
  let afmt = options.afmt;
  if (afmt.includes("{{FrontSide}}")) {
    afmt = afmt.replace("{{FrontSide}}", rawQuestion);
  }
  const rawAnswer = replaceFields(afmt, options.fields, options.clozeOrdinal, true);

  const cleanQ = sanitizeAnkiHtml(rawQuestion, mediaPrefix);
  const cleanA = sanitizeAnkiHtml(rawAnswer, mediaPrefix);

  const audioFiles = Array.from(new Set([...cleanQ.audioFiles, ...cleanA.audioFiles]));
  const imageFiles = Array.from(new Set([...cleanQ.imageFiles, ...cleanA.imageFiles]));

  return {
    questionHtml: cleanQ.html,
    answerHtml: cleanA.html,
    audioFiles,
    imageFiles,
  };
}
