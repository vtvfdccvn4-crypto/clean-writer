from __future__ import annotations

import argparse
import html
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    KeepTogether,
    LongTable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def package_files(folder: str, pattern: str) -> list[Path]:
    return [path.relative_to(PACKAGE_ROOT) for path in sorted((PACKAGE_ROOT / folder).glob(pattern))]


INCLUDED_FILES = [
    Path("README.md"),
    Path("ANALYSIS.md"),
    Path("package.json"),
    Path("tsconfig.json"),
    *package_files("src", "*.ts"),
    *package_files("examples", "*.ts"),
    *package_files("examples", "*.html"),
    *package_files("test", "*.mjs"),
    *package_files("scripts", "*.mjs"),
    *package_files("scripts", "*.py"),
]


def register_fonts() -> tuple[str, str]:
    candidates = [
        Path("C:/Windows/Fonts/consola.ttf"),
        Path("C:/Windows/Fonts/cour.ttf"),
    ]
    mono_path = next((path for path in candidates if path.exists()), None)
    if mono_path:
        pdfmetrics.registerFont(TTFont("PreviewMono", str(mono_path)))
        mono = "PreviewMono"
    else:
        mono = "Courier"
    return "Helvetica", mono


def build_pdf(output_path: Path) -> None:
    sans, mono = register_fonts()
    styles = getSampleStyleSheet()
    navy = colors.HexColor("#101828")
    blue = colors.HexColor("#175CD3")
    slate = colors.HexColor("#475467")
    muted = colors.HexColor("#667085")
    rule = colors.HexColor("#D0D5DD")
    paper = colors.HexColor("#F8FAFC")

    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Title"],
        fontName=sans,
        fontSize=28,
        leading=31,
        textColor=navy,
        alignment=TA_CENTER,
        spaceAfter=12,
    )
    subtitle_style = ParagraphStyle(
        "CoverSubtitle",
        parent=styles["BodyText"],
        fontName=sans,
        fontSize=11,
        leading=16,
        textColor=slate,
        alignment=TA_CENTER,
    )
    kicker_style = ParagraphStyle(
        "Kicker",
        parent=styles["BodyText"],
        fontName=sans,
        fontSize=8,
        leading=10,
        textColor=blue,
        alignment=TA_CENTER,
        spaceAfter=12,
    )
    heading_style = ParagraphStyle(
        "FileHeading",
        parent=styles["Heading1"],
        fontName=sans,
        fontSize=14,
        leading=18,
        textColor=navy,
        spaceAfter=4,
    )
    meta_style = ParagraphStyle(
        "Meta",
        parent=styles["BodyText"],
        fontName=sans,
        fontSize=7.5,
        leading=10,
        textColor=muted,
    )
    index_style = ParagraphStyle(
        "Index",
        parent=styles["BodyText"],
        fontName=mono,
        fontSize=8.5,
        leading=12,
        textColor=navy,
    )
    code_style = ParagraphStyle(
        "Code",
        parent=styles["Code"],
        fontName=mono,
        fontSize=6.6,
        leading=8.6,
        textColor=navy,
        splitLongWords=True,
        wordWrap="CJK",
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=16 * mm,
        bottomMargin=15 * mm,
        title="Codebase PDF Preview - Isolated Artifact",
        author="Clear Writer",
        subject="Verified source-text preview of the isolated PDF artifact",
    )

    story = [
        Spacer(1, 54 * mm),
        Paragraph("ISOLATED ARTIFACT", kicker_style),
        Paragraph("Codebase PDF Preview", title_style),
        Paragraph(
            "Enhanced source-text compiler, private-channel pagination pipeline, immutable artifact model, and browser preview/print adapter.",
            subtitle_style,
        ),
        Spacer(1, 14 * mm),
        Paragraph(f"{len(INCLUDED_FILES)} reviewed files - generated 26 August 2026", subtitle_style),
        PageBreak(),
        Paragraph("Artifact contents", heading_style),
        Spacer(1, 3 * mm),
    ]

    for file_index, relative_path in enumerate(INCLUDED_FILES, start=1):
        path = PACKAGE_ROOT / relative_path
        line_count = len(path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n").split("\n"))
        story.append(Paragraph(f"{file_index:02d}&nbsp;&nbsp;{html.escape(relative_path.as_posix())} <font color='#667085'>({line_count} lines)</font>", index_style))
        story.append(Spacer(1, 1.2 * mm))

    for relative_path in INCLUDED_FILES:
        path = PACKAGE_ROOT / relative_path
        text = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
        lines = text.split("\n")
        story.extend([
            PageBreak(),
            KeepTogether([
                Paragraph(html.escape(relative_path.as_posix()), heading_style),
                Paragraph(f"{len(lines)} lines", meta_style),
                Spacer(1, 2.5 * mm),
            ]),
        ])
        rows = []
        for line_number, line in enumerate(lines, start=1):
            safe_line = html.escape(line.expandtabs(2)) or "&#8203;"
            rows.append([
                str(line_number),
                Paragraph(safe_line, code_style),
            ])
        table = LongTable(rows, colWidths=[10 * mm, 166 * mm], repeatRows=0, splitByRow=True)
        table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("FONTNAME", (0, 0), (0, -1), mono),
            ("FONTSIZE", (0, 0), (0, -1), 6.6),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#98A2B3")),
            ("ALIGN", (0, 0), (0, -1), "RIGHT"),
            ("LEFTPADDING", (0, 0), (0, -1), 0),
            ("RIGHTPADDING", (0, 0), (0, -1), 2.5 * mm),
            ("LEFTPADDING", (1, 0), (1, -1), 2 * mm),
            ("RIGHTPADDING", (1, 0), (1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0.35 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0.35 * mm),
            ("LINEBEFORE", (1, 0), (1, -1), 0.35, rule),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, paper]),
        ]))
        story.append(table)

    def footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(rule)
        canvas.setLineWidth(0.4)
        canvas.line(15 * mm, 11 * mm, 195 * mm, 11 * mm)
        canvas.setFont(sans, 7.5)
        canvas.setFillColor(muted)
        canvas.drawString(15 * mm, 7 * mm, "Codebase PDF Preview")
        canvas.drawRightString(195 * mm, 7 * mm, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build_pdf(args.output.resolve())
