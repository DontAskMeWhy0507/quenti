import {
  renderAnkiCard,
  extractClozeOrdinals,
  sanitizeAnkiHtml,
} from "../packages/lib/src/anki/template";

describe("Anki Template & Cloze Parsing Engine", () => {
  test("replaces standard fields {{Field}} with field content", () => {
    const card = renderAnkiCard({
      qfmt: "<div>{{Word}}</div>",
      afmt: "{{FrontSide}}<hr id=answer><div>{{Meaning}}</div>",
      fields: {
        Word: "Ephemeral",
        Meaning: "Lasting for a very short time",
      },
    });

    expect(card.questionHtml).toContain("<div>Ephemeral</div>");
    expect(card.answerHtml).toContain("<div>Lasting for a very short time</div>");
    expect(card.answerHtml).toContain("<div>Ephemeral</div>"); // from FrontSide
  });

  test("handles conditional fields {{#Field}} and {{^Field}}", () => {
    const qfmt = "{{#Example}}<b>Example:</b> {{Example}}{{/Example}}{{^Example}}<i>No example available</i>{{/Example}}";
    
    // When Example is present
    const withExample = renderAnkiCard({
      qfmt,
      afmt: "Back",
      fields: { Example: "He lived an ephemeral life." },
    });
    expect(withExample.questionHtml).toContain("<b>Example:</b> He lived an ephemeral life.");
    expect(withExample.questionHtml).not.toContain("No example available");

    // When Example is empty
    const withoutExample = renderAnkiCard({
      qfmt,
      afmt: "Back",
      fields: { Example: "" },
    });
    expect(withoutExample.questionHtml).not.toContain("<b>Example:</b>");
    expect(withoutExample.questionHtml).toContain("<i>No example available</i>");
  });

  test("extractClozeOrdinals identifies all unique cloze numbers", () => {
    const text = "{{c1::Paris}} is the capital of {{c2::France::country}} and {{c1::City of Light}}.";
    const ordinals = extractClozeOrdinals(text);
    expect(ordinals).toEqual([1, 2]);
  });

  test("renders cloze deletions correctly for front and back", () => {
    const qfmt = "{{cloze:Text}}";
    const afmt = "{{cloze:Text}}<br>{{Extra}}";
    const fields = {
      Text: "Canberra is the capital of {{c1::Australia::country}} (not {{c2::Sydney}}).",
      Extra: "Founded in 1913.",
    };

    // For cloze 1:
    const cardC1 = renderAnkiCard({
      qfmt,
      afmt,
      fields,
      clozeOrdinal: 1,
    });
    // Front: c1 is masked with hint, c2 is unmasked plain text
    expect(cardC1.questionHtml).toContain("Canberra is the capital of [country] (not Sydney).");
    // Back: c1 is highlighted, c2 is plain text
    expect(cardC1.answerHtml).toContain('Canberra is the capital of <span class="anki-cloze">Australia</span> (not Sydney).');
    expect(cardC1.answerHtml).toContain("Founded in 1913.");

    // For cloze 2:
    const cardC2 = renderAnkiCard({
      qfmt,
      afmt,
      fields,
      clozeOrdinal: 2,
    });
    // Front: c1 is plain text, c2 is masked default [...]
    expect(cardC2.questionHtml).toContain("Canberra is the capital of Australia (not [...]).");
    // Back: c2 is highlighted
    expect(cardC2.answerHtml).toContain('Canberra is the capital of Australia (not <span class="anki-cloze">Sydney</span>).');
  });

  test("supports field names with parentheses, dots, and Unicode", () => {
    const card = renderAnkiCard({
      qfmt: "<div>{{Word (Audio)}}</div>{{#Example.Sentence}}<div>{{Example.Sentence}}</div>{{/Example.Sentence}}<div>{{Từ vựng}}</div>",
      afmt: "Back",
      fields: {
        "Word (Audio)": "Hello",
        "Example.Sentence": "Hello world.",
        "Từ vựng": "Xin chào",
      },
    });

    expect(card.questionHtml).toContain("<div>Hello</div>");
    expect(card.questionHtml).toContain("<div>Hello world.</div>");
    expect(card.questionHtml).toContain("<div>Xin chào</div>");
  });

  test("sanitizes dangerous HTML tags and event handlers to prevent XSS", () => {
    const dangerousHtml = '<div>Hello <script>alert("xss")</script><iframe src="evil.com"></iframe><img src="pic.jpg" onerror="alert(1)" onclick="steal()" /></div>';
    const result = sanitizeAnkiHtml(dangerousHtml, "/api/anki/media");

    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("alert(");
    expect(result.html).not.toContain("<iframe");
    expect(result.html).not.toContain("onerror");
    expect(result.html).not.toContain("onclick");
    expect(result.html).toContain('src="/api/anki/media/pic.jpg"');
  });
});

