import OpenAI from "openai";
import { requireAdminFromRequest } from "@/app/api/admin/_lib";
import {
  normalizePersonnelDocumentExtraction,
  normalizePersonnelDocumentType,
} from "@/app/utils/personnelDocumentExtraction";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PDF_TYPE = "application/pdf";

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentType",
    "number",
    "countryOfIssue",
    "issueDate",
    "expiryDate",
    "categories",
    "points",
    "checkCode",
    "visibleFields",
    "warning",
  ],
  properties: {
    documentType: { type: "string", enum: ["passport", "drivingLicence", "unknown"] },
    number: { type: "string" },
    countryOfIssue: { type: "string" },
    issueDate: { type: "string" },
    expiryDate: { type: "string" },
    categories: { type: "string" },
    points: { type: "string" },
    checkCode: { type: "string" },
    visibleFields: { type: "array", items: { type: "string" } },
    warning: { type: "string" },
  },
};

function jsonError(message, status) {
  return Response.json({ error: message }, { status });
}

export async function POST(request) {
  const access = await requireAdminFromRequest(request);
  if (access.error) return access.error;

  if (!process.env.OPENAI_API_KEY) {
    return jsonError("Document reading is not configured. Add OPENAI_API_KEY to enable it.", 503);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const requestedType = normalizePersonnelDocumentType(formData.get("documentType"));

    if (!requestedType) return jsonError("Choose passport or driving licence extraction.", 400);
    if (!(file instanceof File) || file.size === 0) return jsonError("Choose a document image or PDF.", 400);
    if (file.size > MAX_FILE_BYTES) return jsonError("The document must be 8 MB or smaller.", 413);

    const mimeType = String(file.type || "").toLowerCase();
    if (!IMAGE_TYPES.has(mimeType) && mimeType !== PDF_TYPE) {
      return jsonError("Automatic reading supports JPG, PNG, WebP, GIF, or PDF files.", 415);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
    const documentInput = mimeType === PDF_TYPE
      ? { type: "input_file", filename: file.name || "document.pdf", file_data: dataUrl }
      : { type: "input_image", detail: "high", image_url: dataUrl };

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_DOCUMENT_MODEL || "gpt-4.1-mini",
      store: false,
      max_output_tokens: 700,
      instructions: [
        "Read identity documents conservatively and return only text visibly present in the supplied document.",
        "Never invent, infer, complete, or checksum-correct an obscured value. Use an empty string when unreadable or absent.",
        "Dates must be YYYY-MM-DD. countryOfIssue should be the issuing country, not nationality or place of birth.",
        "For a driving licence, categories means vehicle entitlement codes visible on the document.",
        "Physical UK photocard licences normally do not display penalty points or a DVLA check code; leave those empty unless explicitly visible.",
        "Put any ambiguity, document-type mismatch, cropped side, glare, or unreadable text in warning.",
      ].join(" "),
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Extract the visible fields from this ${requestedType === "passport" ? "passport" : "driving licence"}.`,
          },
          documentInput,
        ],
      }],
      text: {
        format: {
          type: "json_schema",
          name: "personnel_document_fields",
          strict: true,
          schema: EXTRACTION_SCHEMA,
        },
      },
    });

    const parsed = JSON.parse(response.output_text || "{}");
    const extraction = normalizePersonnelDocumentExtraction(parsed, requestedType);
    if (extraction.documentType !== requestedType) {
      extraction.warning = extraction.warning || "The uploaded document does not appear to match the selected document type.";
    }

    return Response.json({ extraction });
  } catch (error) {
    console.error("Personnel document extraction failed:", error);
    return jsonError("The document could not be read. Check the image is clear and try again.", 502);
  }
}
