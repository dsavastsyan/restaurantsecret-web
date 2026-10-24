"""Render the dated consent source to a Cyrillic PDF; never rewrite archives."""

import argparse
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle


def render(source, destination, font, bold_font):
    pdfmetrics.registerFont(TTFont("Consent", str(font)))
    pdfmetrics.registerFont(TTFont("ConsentBold", str(bold_font)))
    pdfmetrics.registerFontFamily("Consent", normal="Consent", bold="ConsentBold")
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("ConsentBody", fontName="Consent", fontSize=10,
                              leading=13.5, spaceAfter=6, splitLongWords=True))
    styles.add(ParagraphStyle("ConsentTitle", parent=styles["ConsentBody"],
                              fontName="ConsentBold", fontSize=17, leading=21,
                              alignment=TA_CENTER, spaceAfter=9, keepWithNext=True))
    styles.add(ParagraphStyle("ConsentSubtitle", parent=styles["ConsentTitle"],
                              fontSize=12, leading=17))
    styles.add(ParagraphStyle("ConsentHeading", parent=styles["ConsentBody"],
                              fontName="ConsentBold", fontSize=11, leading=16,
                              spaceBefore=10, keepWithNext=True))
    styles.add(ParagraphStyle("ConsentCell", parent=styles["ConsentBody"],
                              fontSize=9, leading=12, spaceAfter=0))

    story = []
    table_rows = []

    def paragraph(text, style="ConsentBody"):
        return Paragraph(escape(text), styles[style])

    def flush_table():
        if not table_rows:
            return
        table = LongTable(table_rows, colWidths=[68 * mm, 106 * mm], repeatRows=1,
                          hAlign="LEFT")
        table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EDF1F4")),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#BEC7CF")),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        story.extend([table, Spacer(1, 9)])
        table_rows.clear()

    for line in source.read_text(encoding="utf-8").splitlines():
        if line.startswith("| "):
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if not all(set(cell) <= {"-", ":", " "} for cell in cells):
                table_rows.append([paragraph(cell, "ConsentCell") for cell in cells])
            continue
        flush_table()
        if not line.strip():
            continue
        if line.startswith("### "):
            story.append(paragraph(line[4:], "ConsentHeading"))
        elif line.startswith("## "):
            story.append(paragraph(line[3:], "ConsentSubtitle"))
        elif line.startswith("# "):
            story.append(paragraph(line[2:], "ConsentTitle"))
        else:
            story.append(paragraph(line))
    flush_table()

    def footer(canvas, document):
        canvas.setFont("Consent", 8)
        canvas.setFillColor(colors.HexColor("#58636F"))
        canvas.drawString(18 * mm, 12 * mm, "RestaurantSecret / AnyEat | 24.10.2026")
        canvas.drawRightString(192 * mm, 12 * mm, str(document.page))

    destination.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(destination), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=17 * mm, bottomMargin=20 * mm,
        title="Согласие на обработку персональных данных RestaurantSecret и AnyEat - 24.10.2026",
        author="Савастьян Дарья", subject="Редакция от 24 октября 2026 года",
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument("--bold-font", type=Path, required=True)
    args = parser.parse_args()
    render(args.source, args.destination, args.font, args.bold_font)
