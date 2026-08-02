#!/usr/bin/env python3
"""Generate ZURI founder pitch deck PDF."""

from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "ZURI-Founder-Pitch-Deck.pdf"
LOGO = ROOT / "client" / "public" / "ZURI.png"

# Brand
ORANGE = colors.HexColor("#ffbd59")
YELLOW = colors.HexColor("#ffcd1c")
BLACK = colors.HexColor("#000000")
GRAY = colors.HexColor("#4b5563")
LIGHT_GRAY = colors.HexColor("#f3f4f6")
CREAM = colors.HexColor("#fefbf5")
WHITE = colors.white

PAGE_W, PAGE_H = landscape((10 * inch, 7.5 * inch))
MARGIN = 0.65 * inch


def build_styles():
    base = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle(
            "eyebrow",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            textColor=GRAY,
            spaceAfter=10,
            leading=12,
        ),
        "title": ParagraphStyle(
            "title",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=34,
            textColor=BLACK,
            leading=38,
            spaceAfter=14,
        ),
        "title_white": ParagraphStyle(
            "title_white",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=34,
            textColor=WHITE,
            leading=38,
            spaceAfter=14,
        ),
        "subtitle": ParagraphStyle(
            "subtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=16,
            textColor=GRAY,
            leading=22,
            spaceAfter=8,
        ),
        "subtitle_white": ParagraphStyle(
            "subtitle_white",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=16,
            textColor=colors.HexColor("#d1d5db"),
            leading=22,
            spaceAfter=8,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=13,
            textColor=BLACK,
            leading=18,
            spaceAfter=8,
        ),
        "body_white": ParagraphStyle(
            "body_white",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=13,
            textColor=colors.HexColor("#e5e7eb"),
            leading=18,
            spaceAfter=8,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=12.5,
            textColor=BLACK,
            leading=17,
            leftIndent=14,
            bulletIndent=0,
            spaceAfter=6,
        ),
        "bullet_white": ParagraphStyle(
            "bullet_white",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=12.5,
            textColor=colors.HexColor("#f3f4f6"),
            leading=17,
            leftIndent=14,
            bulletIndent=0,
            spaceAfter=6,
        ),
        "highlight": ParagraphStyle(
            "highlight",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=20,
            textColor=ORANGE,
            leading=26,
            spaceAfter=10,
        ),
        "center": ParagraphStyle(
            "center",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=14,
            textColor=GRAY,
            alignment=TA_CENTER,
            leading=20,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=GRAY,
            alignment=TA_CENTER,
        ),
        "stat_num": ParagraphStyle(
            "stat_num",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=28,
            textColor=ORANGE,
            leading=32,
        ),
        "stat_label": ParagraphStyle(
            "stat_label",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            textColor=GRAY,
            leading=14,
        ),
    }


def bullets(items, styles, style_key="bullet"):
    return [Paragraph(f"• {text}", styles[style_key]) for text in items]


def stat_row(stats, styles):
    cells = []
    for num, label in stats:
        cells.append(
            [
                Paragraph(num, styles["stat_num"]),
                Paragraph(label, styles["stat_label"]),
            ]
        )
    t = Table(cells, colWidths=[2.4 * inch] * len(stats))
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 16),
            ]
        )
    )
    return t


def two_col(left_items, right_items, styles):
    t = Table([[left_items, right_items]], colWidths=[4.6 * inch, 4.6 * inch])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 24),
            ]
        )
    )
    return t


def draw_slide_bg(c, dark=False):
    if dark:
        c.setFillColor(BLACK)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    else:
        c.setFillColor(CREAM)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        c.setFillColor(ORANGE)
        c.setFillAlpha(0.08)
        c.circle(PAGE_W * 0.5, PAGE_H, 180, fill=1, stroke=0)
        c.setFillAlpha(1)


def draw_footer(c, slide_num, slide_total):
    c.setFillColor(GRAY)
    c.setFont("Helvetica", 8)
    c.drawString(MARGIN, 0.35 * inch, "ZURI · zuriqo.com · Confidential — Founder Use")
    if slide_total:
        c.drawRightString(PAGE_W - MARGIN, 0.35 * inch, f"{slide_num} / {slide_total}")


def on_page(slide_num_ref, slide_total, dark=False):
    def _hook(c, doc):
        slide_num_ref[0] += 1
        draw_slide_bg(c, dark=dark)
        draw_footer(c, slide_num_ref[0], slide_total)

    return _hook


def main():
    styles = build_styles()
    slide_total = 16
    slide_num = [0]

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=(PAGE_W, PAGE_H),
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=0.55 * inch,
    )

    story = []

    # Slide 1 — Cover
    cover = []
    if LOGO.exists():
        cover.append(Image(str(LOGO), width=1.6 * inch, height=0.45 * inch))
        cover.append(Spacer(1, 0.35 * inch))
    cover.extend(
        [
            Paragraph("Z U R I", styles["eyebrow"]),
            Paragraph(
                'Personalise every guest journey,<br/><font color="#ffbd59">from menu to payout.</font>',
                styles["title"],
            ),
            Spacer(1, 0.1 * inch),
            Paragraph(
                "Founder Pitch Deck · AI menus · Smart ordering · Events ticketing",
                styles["subtitle"],
            ),
            Spacer(1, 0.35 * inch),
            Paragraph(
                "<b>The simple version:</b> ZURI is the AI-powered operating layer for restaurants, "
                "hotels, and events in Africa — one link for guests to browse, order, pay, or buy tickets; "
                "one dashboard for the business to run service and get paid.",
                styles["body"],
            ),
        ]
    )
    story.extend(cover)
    story.append(PageBreak())

    # Slide 2 — 10-second pitch
    story.append(Paragraph("THE 10-SECOND PITCH", styles["eyebrow"]))
    story.append(
        Paragraph(
            '"ZURI is Stripe-meets-Toast for African hospitality — with AI that actually understands local guests."',
            styles["highlight"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        two_col(
            [
                Paragraph('<b>When someone asks "What is Zuri?" say this:</b>', styles["body"]),
                Spacer(1, 6),
                *bullets(
                    [
                        "We give any restaurant, hotel, or event a smart storefront in minutes.",
                        "Guests scan a QR or use Zuri Tap — no app download.",
                        "They browse an AI-personalised menu or buy tickets, pay on their phone.",
                        "The business sees orders live, gets analytics, and receives payouts to their bank.",
                    ],
                    styles,
                ),
            ],
            [
                Paragraph("<b>What category we play in:</b>", styles["body"]),
                Spacer(1, 6),
                *bullets(
                    [
                        "<b>Hospitality commerce infrastructure</b> — not just a QR menu.",
                        "<b>Guest intelligence</b> — AI recommendations, trending, reorder, local languages.",
                        "<b>Payments rail</b> — Paystack/Monnify, Naira-native, 1.5% on orders.",
                        "<b>Events layer</b> — ticketing storefronts on the same platform.",
                    ]
                , styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    # Slide 3 — Problem
    story.append(Paragraph("THE PROBLEM", styles["eyebrow"]))
    story.append(
        Paragraph(
            "African venues run on chaos.<br/>"
            '<font color="#ffbd59">Western tools weren\'t built for this reality.</font>',
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.1 * inch))
    story.append(
        two_col(
            [
                Paragraph("<b>For the guest</b>", styles["body"]),
                *bullets(
                    [
                        "Wait for a waiter, decode a paper menu, or download yet another app.",
                        "Language barriers — menus rarely speak Hausa, Yorùbá, or Igbo.",
                        "Peak-hour friction: shared tables, loud rooms, slow card terminals.",
                        "Events: long queues, manual ticket lists, cash reconciliation nightmares.",
                    ]
                , styles),
            ],
            [
                Paragraph("<b>For the business</b>", styles["body"]),
                *bullets(
                    [
                        "5–7 disconnected tools: POS, WhatsApp orders, spreadsheets, Eventbrite, bank alerts.",
                        "No real-time view of what's selling, what's trending, or what's running out.",
                        "Staff bottleneck — every order passes through a human middleman.",
                        "Finance teams reconcile manually; owners can't see margin until month-end.",
                    ]
                , styles),
            ],
            styles,
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(
        Paragraph(
            "<i>The gap:</i> Africa's hospitality economy is massive and mobile-first, but the software stack "
            "is either too expensive (global POS suites), too basic (static QR PDF menus), or too narrow (ticketing-only).",
            styles["body"],
        )
    )
    story.append(PageBreak())

    # Slide 4 — Solution
    story.append(Paragraph("THE SOLUTION", styles["eyebrow"]))
    story.append(
        Paragraph(
            "One platform.<br/><font color=\"#ffbd59\">Menu → Order → Pay → Insight.</font>",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        stat_row(
            [
                ("Scan", "Guest opens link — no app"),
                ("Browse", "AI menu or tickets"),
                ("Pay", "Phone checkout + bank payout"),
            ],
            styles,
        )
    )
    story.append(Spacer(1, 0.25 * inch))
    story.append(
        two_col(
            [
                Paragraph("<b>What ZURI replaces</b>", styles["body"]),
                *bullets(
                    [
                        "Static QR menus → live, branded storefronts",
                        "WhatsApp order chaos → structured order inbox",
                        "Separate ticketing tools → same dashboard, same payouts",
                        "Gut-feel decisions → Zuri Assist analytics & AI ops",
                    ]
                , styles),
            ],
            [
                Paragraph("<b>Core product modules</b>", styles["body"]),
                *bullets(
                    [
                        "<b>Smart Storefront</b> — menu or event tickets, your brand",
                        "<b>QR + Zuri Tap</b> — scan or 6-digit code, saved card checkout",
                        "<b>Payments</b> — Naira payouts via licensed processors (Paystack/Monnify)",
                        "<b>Zuri Assist</b> — guest AI + manager AI in one brain",
                        "<b>Analytics</b> — sales, peaks, margins, market benchmarks",
                    ]
                , styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    # Slide 5 — Zuri Assist
    story.append(Paragraph("ZURI ASSIST — THE MOAT", styles["eyebrow"]))
    story.append(
        Paragraph(
            "One brain for the floor<br/>and the guest.",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        two_col(
            [
                Paragraph("<b>On the guest menu (Growth+)</b>", styles["body"]),
                *bullets(
                    [
                        "<b>For You</b> — personalised picks based on taste & history",
                        "<b>Trending</b> — what the room is ordering right now",
                        "<b>Reorder</b> — one tap back to their usual",
                        "Local language names: Hausa, Yorùbá, Igbo",
                        "Dietary chips, upsells, taste-based sorting",
                    ]
                , styles),
            ],
            [
                Paragraph("<b>On the business dashboard (Scale+)</b>", styles["body"]),
                *bullets(
                    [
                        "Revenue insights, forecasts, promo ideas, AI chat",
                        "Live ops: rush alerts, anomalies, low-stock flags",
                        "Market intelligence — anonymous Zuri Network benchmarks",
                        "Customer intelligence & premium analytics",
                        "CSV import for high-volume menus or ticket types",
                    ]
                , styles),
            ],
            styles,
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        Paragraph(
            "<b>Why this matters:</b> Competitors digitise the menu. ZURI digitises the <i>decision</i> — "
            "what to order, what to promote, when to prep, what to price.",
            styles["body"],
        )
    )
    story.append(PageBreak())

    # Slide 6 — Built for Africa
    story.append(Paragraph("WHY AFRICA — AND WHY NOW", styles["eyebrow"]))
    story.append(
        Paragraph(
            "Built for Africa's front-of-house reality.",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        two_col(
            [
                Paragraph("<b>Africa-specific design choices</b>", styles["body"]),
                *bullets(
                    [
                        "Naira-native pricing & payouts — no USD conversion friction",
                        "Works on any smartphone browser — low bandwidth, no app store",
                        "Peak-hour noise, shared tables, thousand-person events",
                        "Guest menus in local languages — not English-only imports",
                        "Monnify + Paystack — payments Africans actually use",
                    ]
                , styles),
            ],
            [
                Paragraph("<b>Why the world needs this too</b>", styles["body"]),
                *bullets(
                    [
                        "Emerging markets = mobile-first commerce (same playbook as M-Pesa, Flutterwave)",
                        "Hospitality is the #1 offline sector going digital post-COVID",
                        "AI personalisation is the new table stakes — Africa will leapfrog, not catch up",
                        "Events + F&B convergence — concerts, pop-ups, food halls need one stack",
                        "Exportable model: Nigeria → Ghana → Kenya → MENA → diaspora venues globally",
                    ]
                , styles),
            ],
            styles,
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(
        stat_row(
            [
                ("500K+", "Restaurants & cafés in Nigeria alone"),
                ("$100B+", "Global hospitality tech TAM"),
                ("70%+", "Smartphone penetration in urban Africa"),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    # Slide 7 — Differentiation
    story.append(Paragraph("WHAT'S DIFFERENT", styles["eyebrow"]))
    story.append(
        Paragraph(
            "Not another QR menu.<br/>Not another POS.",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.1 * inch))

    comparison_data = [
        ["", "Static QR menus", "Global POS (Toast, etc.)", "Event platforms", "ZURI"],
        ["Setup time", "Minutes", "Weeks + hardware", "Days", "Minutes"],
        ["African payments", "Rarely", "Limited", "Limited", "Native Naira"],
        ["Guest AI personalisation", "No", "Add-on / expensive", "No", "Built-in"],
        ["Menu + tickets unified", "No", "No", "Tickets only", "Yes"],
        ["Local languages on menu", "No", "No", "No", "Hausa/Yoruba/Igbo"],
        ["Price for small venue", "Free–cheap", "$100s/month", "High fees", "Free → ₦9,900/mo"],
        ["Manager AI copilot", "No", "Enterprise only", "No", "Scale tier"],
    ]
    t = Table(comparison_data, colWidths=[1.35 * inch, 1.55 * inch, 1.55 * inch, 1.35 * inch, 1.35 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BLACK),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("BACKGROUND", (-1, 1), (-1, -1), colors.HexColor("#fff7ed")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (-1, 1), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(t)
    story.append(PageBreak())

    # Slide 8 — Business model
    story.append(Paragraph("BUSINESS MODEL", styles["eyebrow"]))
    story.append(
        Paragraph(
            "SaaS + transaction revenue.<br/><font color=\"#ffbd59\">Aligned with venue success.</font>",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        two_col(
            [
                Paragraph("<b>Subscription tiers (NGN/month)</b>", styles["body"]),
                *bullets(
                    [
                        "<b>Free</b> — QR ordering, text menu, orders inbox (try end-to-end)",
                        "<b>Starter ₦9,900</b> — photos, logo, AI menu upload from photo/PDF",
                        "<b>Growth ₦24,900</b> — analytics, Zuri Tap, guest AI menu, catalog presets",
                        "<b>Scale ₦59,900</b> — Zuri Assist dashboard, live ops, market intel, CSV import",
                        "<b>Enterprise</b> — custom rollout for chains & large events",
                    ]
                , styles),
            ],
            [
                Paragraph("<b>Transaction fees (on successful sales)</b>", styles["body"]),
                *bullets(
                    [
                        "<b>Menu orders:</b> 1.5% per transaction",
                        "<b>Event ticketing:</b> 4% + ₦50 per ticket sale",
                        "Payments processed by licensed partners — ZURI does not hold funds",
                    ]
                , styles),
                Spacer(1, 10),
                Paragraph("<b>Revenue flywheel</b>", styles["body"]),
                *bullets(
                    [
                        "Free tier → viral QR adoption at venues",
                        "Growth tier → sticky analytics + guest AI",
                        "Scale tier → high-ARPU ops teams & chains",
                        "Transaction fees → scale with GMV, not headcount",
                    ]
                , styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    # Slide 9 — Market & valuation path
    story.append(Paragraph("MARKET & PATH TO $1B", styles["eyebrow"]))
    story.append(
        Paragraph(
            "The TAM is huge.<br/>The wedge is narrow and sharp.",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.12 * inch))
    story.append(
        two_col(
            [
                Paragraph("<b>Market sizing (conservative framing)</b>", styles["body"]),
                *bullets(
                    [
                        "<b>TAM:</b> $100B+ global restaurant/hospitality software + payments",
                        "<b>SAM:</b> ~$8–12B Africa F&B + events digitisation (Nigeria, Ghana, Kenya, SA)",
                        "<b>SOM (5yr):</b> 50,000 active venues × ₦25K avg MRR + 1.5% of ₦500B GMV",
                        "Ticketing adds high-value events: concerts, weddings, conferences",
                    ]
                , styles),
                Spacer(1, 8),
                Paragraph("<b>Comparable exits & valuations</b>", styles["body"]),
                *bullets(
                    [
                        "Toast (US POS) — $20B+ peak market cap",
                        "Square / Block — payments + commerce OS",
                        "Eventbrite, Ticketmaster — ticketing infrastructure",
                        "Flutterwave, Paystack — African payments rails we plug into",
                    ]
                , styles),
            ],
            [
                Paragraph("<b>How ZURI becomes a billion-dollar company</b>", styles["body"]),
                *bullets(
                    [
                        "<b>1. Land</b> — free QR menus; every table is a distribution node",
                        "<b>2. Expand</b> — upsell AI, analytics, Tap; increase take rate on GMV",
                        "<b>3. Network</b> — Zuri Tap = saved cards across venues (two-sided network)",
                        "<b>4. Data moat</b> — Zuri Network benchmarks; best guest AI in African F&B",
                        "<b>5. Platform</b> — reservations, loyalty, supplier ordering, franchise ops",
                        "<b>6. Geography</b> — Nigeria wedge → West Africa → continent → diaspora",
                    ]
                , styles),
                Spacer(1, 8),
                Paragraph(
                    "<b>Illustrative math:</b> 100,000 venues × $200/yr SaaS + 1.5% of $50B annual GMV "
                    "= $20M ARR + $750M payment revenue share → multi-billion platform at scale.",
                    styles["body"],
                ),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    # Slide 10 — Zuri Tap network
    story.append(Paragraph("ZURI TAP — THE NETWORK BET", styles["eyebrow"]))
    story.append(
        Paragraph(
            "Pay with a code.<br/>No scan. No friction.",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        two_col(
            [
                Paragraph("<b>How it works</b>", styles["body"]),
                *bullets(
                    [
                        "Business gets a 6-character Tap code in their dashboard",
                        "Guest signs up once, saves a card to their Zuri Tap account",
                        "Business sends payment request → guest confirms with Tap password",
                        "Same payout rails as every other Zuri order",
                    ]
                , styles),
            ],
            [
                Paragraph("<b>Why this is strategically huge</b>", styles["body"]),
                *bullets(
                    [
                        "Creates a <b>consumer identity layer</b> across all Zuri venues",
                        "Repeat guests checkout in seconds — higher conversion, higher GMV",
                        "Cross-venue data enables better personalisation (For You, Reorder)",
                        "This is how Square Cash App started — payments identity → platform",
                    ]
                , styles),
            ],
            styles,
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(
        Paragraph(
            '<b>Investor one-liner:</b> "Zuri Tap turns every restaurant into a node on a pan-African hospitality payment network."',
            styles["highlight"],
        )
    )
    story.append(PageBreak())

    # Slide 11 — Who it's for
    story.append(Paragraph("WHO IT'S FOR", styles["eyebrow"]))
    story.append(
        Paragraph(
            "Perfect for restaurants.<br/>Concerts. Hotels. Pop-ups. You.",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        two_col(
            [
                Paragraph("<b>Ideal first customers (Africa GTM)</b>", styles["body"]),
                *bullets(
                    [
                        "Busy Lagos/Abuja restaurants tired of WhatsApp orders",
                        "Hotel restaurants & lounges wanting premium digital menus",
                        "Event organisers selling tickets + F&B at the same event",
                        "Food halls & pop-ups needing fast setup, no hardware",
                        "Cafés and bars wanting analytics without enterprise POS cost",
                    ]
                , styles),
            ],
            [
                Paragraph("<b>Expansion customers</b>", styles["body"]),
                *bullets(
                    [
                        "Restaurant chains needing multi-location catalog presets",
                        "Concert promoters & wedding planners (ticketing mode)",
                        "Hotels with room service + restaurant + events",
                        "Franchise groups needing market intelligence benchmarks",
                        "Diaspora African restaurants abroad (same product, global cards)",
                    ]
                , styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    # Slide 12 — Traction
    story.append(Paragraph("WHERE WE ARE TODAY", styles["eyebrow"]))
    story.append(
        Paragraph(
            "Live product.<br/>Real infrastructure.",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.15 * inch))
    story.append(
        two_col(
            [
                Paragraph("<b>What's built & shipping</b>", styles["body"]),
                *bullets(
                    [
                        "Full-stack platform live at zuriqo.com",
                        "Business dashboard: orders, menu, analytics, QR, payments, reservations",
                        "Guest storefront: menu + ticketing modes, AI personalisation",
                        "Zuri Tap consumer payments with saved cards",
                        "Paystack + Monnify payment integration",
                        "Tiered SaaS with Growth/Scale AI feature gates",
                        "Storefront customiser, event landing pages, font pairings",
                    ]
                , styles),
            ],
            [
                Paragraph("<b>What we're proving next</b>", styles["body"]),
                *bullets(
                    [
                        "Venue density in Lagos — land-and-expand playbook",
                        "Zuri Tap adoption — guest accounts per active business",
                        "GMV growth — transaction fee revenue at scale",
                        "Case studies: faster table turns, higher average order value",
                        "Partnerships: hotel groups, event promoters, food aggregators",
                    ]
                , styles),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    # Slide 13 — Vision
    story.append(Paragraph("THE VISION", styles["eyebrow"]))
    story.append(
        Paragraph(
            "The operating system for<br/>African hospitality commerce.",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(
        Paragraph(
            "Today, ZURI is the smartest way for a guest to order food or buy a ticket at an African venue.<br/><br/>"
            "Tomorrow, ZURI is the intelligence layer that runs the entire front-of-house — "
            "what guests see, what kitchens prep, what managers promote, and how money moves.<br/><br/>"
            "<b>We are not building a feature.</b> We are building the default infrastructure "
            "for how Africa eats, drinks, and experiences events — the way Stripe became default for online payments.",
            styles["body"],
        )
    )
    story.append(Spacer(1, 0.25 * inch))
    story.append(
        stat_row(
            [
                ("Mission", "Less friction at the table, more flow at the back"),
                ("Tagline", "From menu to payout"),
                ("Category", "AI hospitality commerce"),
            ],
            styles,
        )
    )
    story.append(PageBreak())

    # Slide 14 — Founder talk track
    story.append(Paragraph("HOW TO SELL IT (FOUNDER SCRIPT)", styles["eyebrow"]))
    story.append(
        Paragraph(
            "Copy-paste answers<br/>for real conversations.",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.12 * inch))

    scripts = [
        (
            '"So what is Zuri?"',
            '"It\'s like giving your restaurant or event a smart storefront and a manager AI in one. '
            'Customers scan, order or buy tickets on their phone, pay, and you get the money in your bank. '
            'No app download, no expensive POS."',
        ),
        (
            '"Why not just use a QR menu?"',
            '"A QR menu is a PDF. Zuri is alive — it takes orders, takes payments, shows guests what\'s trending, '
            'speaks their language, and tells you what to promote before the rush."',
        ),
        (
            '"Why Africa?"',
            '"Because our venues are mobile-first, high-volume, and multilingual — and global tools ignore that. '
            'We built for peak-hour Lagos, not quiet suburban America."',
        ),
        (
            '"Can this really be big?"',
            '"Every table is a transaction. Africa has hundreds of thousands of venues and a growing events economy. '
            'We take SaaS plus a small cut of every order. Toast is worth $20B doing this in the US. '
            'Africa doesn\'t have a winner yet — that\'s the opportunity."',
        ),
        (
            '"What makes you different?"',
            '"Three things: AI that knows African guests, payments that settle in Naira, and one platform for '
            'both food and events. Nobody else combines all three."',
        ),
    ]
    for q, a in scripts:
        story.append(Paragraph(f"<b>{q}</b>", styles["body"]))
        story.append(Paragraph(a, styles["body"]))
        story.append(Spacer(1, 6))
    story.append(PageBreak())

    # Slide 15 — Closing
    story.append(Spacer(1, 0.8 * inch))
    if LOGO.exists():
        story.append(Image(str(LOGO), width=2 * inch, height=0.55 * inch))
        story.append(Spacer(1, 0.4 * inch))
    story.append(
        Paragraph(
            "Let's build the default<br/><font color=\"#ffbd59\">hospitality layer for Africa.</font>",
            styles["title"],
        )
    )
    story.append(Spacer(1, 0.2 * inch))
    story.append(
        Paragraph(
            "zuriqo.com · info@zuriqo.com<br/>Book a demo at zuriqo.com/demo",
            styles["center"],
        )
    )
    story.append(Spacer(1, 0.35 * inch))
    story.append(
        Paragraph(
            "<i>Confidential — for founder, investor, and partner conversations.</i>",
            styles["footer"],
        )
    )

    doc.build(
        story,
        onFirstPage=on_page(slide_num, slide_total, dark=False),
        onLaterPages=on_page(slide_num, slide_total, dark=False),
    )
    print(f"Generated: {OUTPUT}")


if __name__ == "__main__":
    main()
