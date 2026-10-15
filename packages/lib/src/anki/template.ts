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
    result = result.replace(/\{\{#([^{}#/:]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, rawField, inner) => {
      changed = true;
      const fieldName = rawField.trim();
      const val = fields[fieldName] ?? fields[rawField];
      return isFieldEmpty(val) ? "" : inner;
    });

    // Inverted conditional: {{^Field}}...{{/Field}}
    result = result.replace(/\{\{\^([^{}#/:]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, rawField, inner) => {
      changed = true;
      const fieldName = rawField.trim();
      const val = fields[fieldName] ?? fields[rawField];
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
  rendered = rendered.replace(/\{\{cloze:([^{}#/:]+)\}\}/g, (_match, rawField) => {
    const fieldName = rawField.trim();
    const val = fields[fieldName] ?? fields[rawField] ?? "";
    if (clozeOrdinal !== undefined) {
      return renderCloze(val, clozeOrdinal, isBack);
    }
    return val;
  });

  // Replace {{type:FieldName}}
  rendered = rendered.replace(/\{\{type:([^{}#/:]+)\}\}/g, (_match, rawField) => {
    const fieldName = rawField.trim();
    const val = fields[fieldName] ?? fields[rawField] ?? "";
    if (!isBack) {
      return `<input class="anki-type-ans" placeholder="Type answer..." />`;
    }
    return `<div class="anki-type-result">${val}</div>`;
  });

  // Replace standard {{FieldName}}
  rendered = rendered.replace(/\{\{([^{}#/:]+)\}\}/g, (_match, rawField) => {
    const fieldName = rawField.trim();
    return fields[fieldName] ?? fields[rawField] ?? "";
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

  // 1. Strip dangerous script, iframe, object, embed, style tags to prevent stored XSS
  let html = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<applet\b[^<]*(?:(?!<\/applet>)<[^<]*)*<\/applet>/gi, "");

  // 2. Strip inline event handlers (e.g. onerror=, onload=, onclick=) and javascript: pseudo-protocol
  html = html
    .replace(/\s+on[a-zA-Z]+=["'][^"']*["']/gi, "")
    .replace(/\s+on[a-zA-Z]+=[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*["']\s*javascript:[^"']*["']/gi, '$1="#"');

  // 3. Extract and replace [sound:filename.ext]
  html = html.replace(/\[sound:([^\]]+)\]/g, (_match, filename) => {
    const cleanFile = filename.trim();
    audioSet.add(cleanFile);
    const src = mediaUrlPrefix ? `${mediaUrlPrefix}/${cleanFile}` : cleanFile;
    return `<div data-anki-sound="${cleanFile}" class="anki-audio" data-src="${src}"></div>`;
  });

  // 4. Extract and rewrite <img src="...">
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
