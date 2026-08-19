const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;

const text = (value) => String(value ?? "").trim();
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const pdfText = (value) =>
  text(value)
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const money = (value, currency = "GBP") =>
  `${text(currency) || "GBP"} ${number(value).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateLabel = (value) => {
  if (!text(value)) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? text(value) || "-"
    : parsed.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
};

function wrap(value, maxChars) {
  const words = pdfText(value).split(/\s+/).filter(Boolean);
  if (!words.length) return ["-"];
  const lines = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      line = "";
    } else if (!line || line.length + word.length + 1 <= maxChars) {
      line = line ? `${line} ${word}` : word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Immutable issued invoice snapshot is required.");
  }
  if (!text(snapshot.invoiceNumber) || !text(snapshot.issueDate)) {
    throw new Error("Issued snapshot requires an official invoice number and issue date.");
  }
  if (!snapshot.customer || !Array.isArray(snapshot.lines) || !snapshot.totals) {
    throw new Error("Issued snapshot requires customer, line and total data.");
  }
}

function contentBuilder() {
  const commands = [];
  const command = (value) => commands.push(value);
  const line = (x1, y1, x2, y2, width = 0.6, grey = 0.75) =>
    command(`${grey} G ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  const box = (x, y, width, height, fillGrey = null, strokeGrey = 0.75) => {
    if (fillGrey !== null) command(`${fillGrey} g ${x} ${y} ${width} ${height} re f`);
    command(`${strokeGrey} G 0.6 w ${x} ${y} ${width} ${height} re S`);
  };
  const drawText = (value, x, y, size = 10, font = "F1", align = "left") => {
    const safe = pdfText(value);
    const estimatedWidth = safe.length * size * (font === "F2" ? 0.55 : 0.5);
    const drawX = align === "right" ? x - estimatedWidth : x;
    command(`0 g BT /${font} ${size} Tf 1 0 0 1 ${drawX.toFixed(2)} ${y.toFixed(2)} Tm (${safe}) Tj ET`);
  };
  return { commands, line, box, drawText };
}

function buildPages(snapshot) {
  const currency = text(snapshot.currency) || "GBP";
  const issueDate = new Date(snapshot.issueDate);
  const dueDate =
    snapshot.dueDate ||
    (!Number.isNaN(issueDate.getTime())
      ? new Date(
          issueDate.getTime() + (number(snapshot.paymentTermsDays) || 30) * 86400000
        ).toISOString()
      : null);
  const lines = snapshot.lines.filter(
    (line) => text(line?.description) || number(line?.quantity) || number(line?.unitPrice)
  );
  const pages = [];
  const rowsPerPage = 20;
  const pageCount = Math.max(1, Math.ceil(lines.length / rowsPerPage));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const { commands, line, box, drawText } = contentBuilder();
    const pageLines = lines.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);

    drawText(snapshot.supplier?.legalName || "Bickers Action", MARGIN, 785, 22, "F2");
    drawText(snapshot.supplier?.description || "Film and TV Action Vehicles", MARGIN, 766, 9);
    drawText("TAX INVOICE", PAGE_WIDTH - MARGIN, 785, 18, "F2", "right");
    drawText(snapshot.invoiceNumber, PAGE_WIDTH - MARGIN, 764, 12, "F2", "right");
    line(MARGIN, 748, PAGE_WIDTH - MARGIN, 748, 1, 0.15);

    const customer = snapshot.customer || {};
    drawText("INVOICE TO", MARGIN, 725, 8, "F2");
    drawText(customer.billingLegalName || customer.name || "-", MARGIN, 708, 11, "F2");
    let customerY = 693;
    const address = customer.address || customer.billingAddress;
    const addressLines =
      typeof address === "string"
        ? address.split(/\r?\n/)
        : [
            address?.line1,
            address?.line2,
            address?.city,
            address?.county,
            address?.postcode,
            customer.billingCountry,
          ];
    addressLines.filter(Boolean).slice(0, 5).forEach((addressLine) => {
      drawText(addressLine, MARGIN, customerY, 9);
      customerY -= 13;
    });

    const metaX = 345;
    const meta = [
      ["Invoice date", dateLabel(snapshot.issueDate)],
      ["Due date", dateLabel(dueDate)],
      ["Job number", snapshot.jobNumber || "-"],
      ["PO number", snapshot.purchaseOrderNumber || "-"],
      ["Payment terms", `${number(snapshot.paymentTermsDays) || 30} days`],
    ];
    meta.forEach(([label, value], index) => {
      const y = 724 - index * 20;
      drawText(label.toUpperCase(), metaX, y, 7, "F2");
      drawText(value, PAGE_WIDTH - MARGIN, y, 9, "F2", "right");
    });

    box(MARGIN, 605, PAGE_WIDTH - MARGIN * 2, 25, 0.9, 0.35);
    drawText("DESCRIPTION", MARGIN + 8, 616, 8, "F2");
    drawText("QTY", 370, 616, 8, "F2", "right");
    drawText("UNIT PRICE", 438, 616, 8, "F2", "right");
    drawText("VAT", 477, 616, 8, "F2", "right");
    drawText("NET", PAGE_WIDTH - MARGIN - 8, 616, 8, "F2", "right");

    let rowY = 584;
    pageLines.forEach((invoiceLine) => {
      const descriptionLines = wrap(invoiceLine.description, 52).slice(0, 2);
      drawText(descriptionLines[0], MARGIN + 8, rowY, 8.5);
      if (descriptionLines[1]) drawText(descriptionLines[1], MARGIN + 8, rowY - 11, 8);
      drawText(number(invoiceLine.quantity).toLocaleString("en-GB"), 370, rowY, 8.5, "F1", "right");
      drawText(money(invoiceLine.unitPrice, currency), 438, rowY, 8.5, "F1", "right");
      drawText(`${number(invoiceLine.taxRate)}%`, 477, rowY, 8.5, "F1", "right");
      const net = invoiceLine.net ?? number(invoiceLine.quantity) * number(invoiceLine.unitPrice);
      drawText(money(net, currency), PAGE_WIDTH - MARGIN - 8, rowY, 8.5, "F1", "right");
      line(MARGIN, rowY - 17, PAGE_WIDTH - MARGIN, rowY - 17, 0.4, 0.86);
      rowY -= 29;
    });

    if (pageIndex === pageCount - 1) {
      const totalsY = Math.max(118, rowY - 15);
      line(325, totalsY + 40, PAGE_WIDTH - MARGIN, totalsY + 40, 0.8, 0.25);
      [
        ["Subtotal excl. VAT", money(snapshot.totals.net, currency)],
        ["VAT", money(snapshot.totals.tax, currency)],
        ["TOTAL", money(snapshot.totals.gross, currency)],
      ].forEach(([label, value], index) => {
        const y = totalsY + 20 - index * 22;
        drawText(label, 350, y, index === 2 ? 10 : 9, index === 2 ? "F2" : "F1");
        drawText(value, PAGE_WIDTH - MARGIN, y, index === 2 ? 11 : 9, "F2", "right");
      });
    }

    line(MARGIN, 56, PAGE_WIDTH - MARGIN, 56, 0.5, 0.65);
    drawText("This is the authoritative issued invoice generated from its immutable issued snapshot.", MARGIN, 39, 7);
    drawText(`Page ${pageIndex + 1} of ${pageCount}`, PAGE_WIDTH - MARGIN, 39, 7, "F1", "right");
    pages.push(commands.join("\n"));
  }
  return pages;
}

function assemblePdf(pageContents, snapshot) {
  const objects = [null];
  const reserve = () => {
    objects.push("");
    return objects.length - 1;
  };
  const set = (id, value) => {
    objects[id] = value;
  };
  const catalogId = reserve();
  const pagesId = reserve();
  const fontRegularId = reserve();
  const fontBoldId = reserve();
  const pageIds = [];

  set(fontRegularId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  set(fontBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  pageContents.forEach((content) => {
    const contentId = reserve();
    const pageId = reserve();
    pageIds.push(pageId);
    set(contentId, `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    set(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
  });

  set(pagesId, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  set(
    catalogId,
    `<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`
  );

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  const title = pdfText(`Invoice ${snapshot.invoiceNumber}`);
  const author = pdfText(snapshot.supplier?.legalName || "Invoice supplier");
  pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R /Info << /Title (${title}) /Author (${author}) /Subject (Issued invoice) >> >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

export function renderIssuedInvoicePdf(issuedSnapshot) {
  validateSnapshot(issuedSnapshot);
  return assemblePdf(buildPages(issuedSnapshot), issuedSnapshot);
}
