#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Build the revised SAKTI research paper as a single, self-contained PDF.

Run with the project virtual environment:
    .\\.venv\\Scripts\\python.exe scripts\\build_paper.py

Output: SAKTI_Research_Paper.pdf in the repository root.

The content below is the revised manuscript. Compared with the earlier draft it
uses first-person voice, per-section scientific tense, expanded mathematics, a
suit-attached wearable as the core concept (WiFi is a demonstration transport
only), a post-spaceflight physiological-change prediction method, a
countermeasure and medication decision-support section, and additional recent
biology and physics references. Figures embed the architecture and electronics
diagrams and the computed result figures.
"""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
    HRFlowable, KeepTogether,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIG = os.path.join(ROOT, "reports", "figures")
DOCS = os.path.join(ROOT, "docs")
OUT = os.path.join(ROOT, "SAKTI_Research_Paper.pdf")

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
ss = getSampleStyleSheet()
body = ParagraphStyle("body", parent=ss["Normal"], fontName="Times-Roman",
                      fontSize=9.6, leading=13.2, alignment=TA_JUSTIFY,
                      spaceAfter=6)
title = ParagraphStyle("title", parent=ss["Title"], fontName="Times-Bold",
                        fontSize=17, leading=21, alignment=TA_CENTER, spaceAfter=4)
authors = ParagraphStyle("authors", parent=body, alignment=TA_CENTER,
                         fontSize=11, leading=15, spaceAfter=2)
affil = ParagraphStyle("affil", parent=body, alignment=TA_CENTER, fontSize=9.5,
                       leading=12, spaceAfter=1)
h1 = ParagraphStyle("h1", parent=body, fontName="Times-Bold", fontSize=11,
                    leading=14, spaceBefore=10, spaceAfter=4, alignment=0)
h2 = ParagraphStyle("h2", parent=body, fontName="Times-BoldItalic", fontSize=10,
                    leading=13, spaceBefore=6, spaceAfter=3)
abstract = ParagraphStyle("abstract", parent=body, fontSize=9.2, leading=12.4,
                          leftIndent=6, rightIndent=6, spaceAfter=4)
eq = ParagraphStyle("eq", parent=body, fontName="Courier", fontSize=9,
                    leading=12, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6)
cap = ParagraphStyle("cap", parent=body, fontSize=8.4, leading=10.8,
                     alignment=TA_CENTER, spaceBefore=3, spaceAfter=10,
                     textColor=colors.HexColor("#333333"))
ref = ParagraphStyle("ref", parent=body, fontSize=8.3, leading=10.6,
                     leftIndent=12, firstLineIndent=-12, spaceAfter=2)

story = []


def P(txt, st=body):
    story.append(Paragraph(txt, st))


def EQ(txt):
    story.append(Paragraph(txt, eq))


def gap(h=4):
    story.append(Spacer(1, h))


def figure(path, caption, width=150 * mm, maxh=95 * mm):
    if not os.path.exists(path):
        P("[figure missing: %s]" % os.path.basename(path), cap)
        return
    img = Image(path)
    iw, ih = img.drawWidth, img.drawHeight
    scale = min(width / iw, maxh / ih)
    img.drawWidth = iw * scale
    img.drawHeight = ih * scale
    img.hAlign = "CENTER"
    story.append(KeepTogether([img, Paragraph(caption, cap)]))


def table(data, widths, caption):
    t = Table(data, colWidths=widths, hAlign="CENTER")
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Times-Roman", 8.4),
        ("FONT", (0, 0), (-1, 0), "Times-Bold", 8.4),
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, colors.black),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.black),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, colors.black),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    story.append(KeepTogether([t, Paragraph(caption, cap)]))


# ===========================================================================
# Front matter
# ===========================================================================
P("SAKTI (ASTRA-HEALTH): A Modular Astronaut Health-Monitoring System "
  "Combining Mechanistic Cardiovascular Simulation and Wearable "
  "Physiological-Signal Models", title)
P("Harsh Prajapati, Jatin Pandey, and Arpit", authors)
P("Team Star Busters", affil)
P("Faculty of Engineering and Technology, University of Lucknow, Lucknow, India", affil)
P("NASA Space Apps Challenge 2026", affil)
gap(6)
story.append(HRFlowable(width="100%", thickness=0.6, color=colors.black))
gap(4)

# ---- Abstract (mixed past for completed actions, present for facts/claims) --
P("<b><i>Abstract</i></b>&mdash;Long-duration human spaceflight exposes crews to "
  "altered gravity, radiation, isolation, and operational constraints that make "
  "onboard health self-assessment essential. We present SAKTI, an astronaut "
  "health-monitoring system built around three independently trained specialist "
  "models and a shared local runtime, together with a suit-attached wearable "
  "display. GRAVITY-HEART is an eleven-parameter reduced-order cardiovascular "
  "model that represents hydrostatic loading, venous pooling, transcapillary "
  "filtration, the Frank&ndash;Starling preload response, and baroreflex "
  "feedback. PPG-HR estimates wrist heart rate from photoplethysmography and "
  "accelerometry using a spectro-temporal convolutional ensemble with "
  "hidden-Markov-model belief tracking. STRESS classifies physiological stress "
  "against a personal rest baseline using a one-dimensional convolutional "
  "network. We trained and evaluated each model on a dedicated terrestrial "
  "dataset. On PhysioNet PRCP (10 participants, 59 posture manoeuvres), the "
  "personalised hierarchical GRAVITY-HEART configuration achieved a held-out "
  "mean RMSE of 6.21 bpm for heart rate and 6.26 mmHg for mean arterial "
  "pressure. On PPG-DaLiA (15 participants), PPG-HR v2 achieved 4.46 bpm online "
  "MAE under leave-one-subject-out evaluation. On WESAD (15 participants), the "
  "personal-baseline network achieved a binary macro-F1 of 0.952 on chest "
  "signals and 0.919 on wrist signals. The wearable attaches directly to the "
  "suit and reads physiological telemetry over a wired bus; a WiFi link serves "
  "only for bench demonstration. SAKTI is a research decision-support system "
  "and is not a certified medical device. All reduced-gravity outputs are "
  "model extrapolations calibrated on Earth-based data.", abstract)
P("<b><i>Index Terms</i></b>&mdash;Human spaceflight, astronaut health "
  "monitoring, cardiovascular modelling, orthostatic intolerance, "
  "photoplethysmography, wearable sensing, stress classification, uncertainty "
  "estimation, local inference.", abstract)

# ===========================================================================
# I. Introduction (present for general truths; present perfect / past for prior work)
# ===========================================================================
P("I.&nbsp;&nbsp;INTRODUCTION", h1)
P("Human exploration beyond low Earth orbit changes the medical operating "
  "environment. NASA groups the hazards of spaceflight into space radiation, "
  "isolation and confinement, distance from Earth, altered gravity fields, and "
  "hostile closed environments, and these hazards interact to amplify "
  "physiological and behavioural risk [2], [3]. The 2026 NASA Space Apps "
  "Challenge asks teams to help astronauts gather health indicators, assess "
  "their status, and act when ground-based medical support is delayed or "
  "unavailable [1]. Prior NASA Human Research Program work has established "
  "longitudinal measurement programmes, including Standard Measures and the "
  "CIPHER suite, that motivate continuous onboard monitoring [4], [6].", body)
P("A crew-facing system must do more than display population reference ranges. "
  "A measurement can be unremarkable for one individual yet differ markedly from "
  "another individual's established baseline. Health indicators are also "
  "heterogeneous: a wrist photoplethysmography (PPG) stream, an orthostatic "
  "blood-pressure response, and a self-reported stress score are sampled at "
  "different rates and are not interchangeable. We therefore connect independent "
  "specialist models through a common application rather than forcing unrelated "
  "public datasets into a single end-to-end network, because the latter would "
  "constitute an invalid training design.", body)
P("We summarise our contributions as follows. We developed a reduced-order, "
  "eleven-parameter closed-loop cardiovascular model and fitted it to measured "
  "posture responses with population, personalised, and hierarchical-prior "
  "configurations. We built a spectro-temporal convolutional ensemble with "
  "hidden-Markov-model tracking for causal wrist heart-rate estimation with "
  "calibrated uncertainty. We evaluated a personal-baseline stress classifier "
  "subject-wise on WESAD. We integrated the deployed models into a shared Rust "
  "engine serving a desktop and browser application, and we built a "
  "suit-attached wearable display with firmware whose data transport is "
  "selectable between a direct suit bus and a demonstration WiFi link. We "
  "extended the cardiovascular model to project post-mission orthostatic "
  "responses and to surface mission-approved countermeasures.", body)

# ===========================================================================
# II. Related work (past / present perfect)
# ===========================================================================
P("II.&nbsp;&nbsp;RELATED WORK AND SPACEFLIGHT CONTEXT", h1)
P("<i>A. Spaceflight physiology and hazards.</i> The Human Research Program has "
  "identified cardiovascular, sensorimotor, bone, immune, sleep, behavioural, "
  "and radiation risks that arise from the spaceflight environment [2], [3]. "
  "Hargens and Richardson described the headward fluid shift that follows entry "
  "into microgravity and its cardiovascular consequences [17]. Lee and "
  "colleagues characterised spaceflight-associated neuro-ocular syndrome (SANS), "
  "which links the sustained cephalad fluid shift to ophthalmic changes [18]. Fu "
  "and Levine reported that long-duration crews showed measurable changes in "
  "orthostatic tolerance and sympathetic regulation after flight, and that "
  "in-flight exercise influenced recovery [19]. Cucinotta and Durante quantified "
  "the cancer risk associated with galactic cosmic radiation, which frames "
  "radiation as a dose-tracked physical exposure rather than an inferable "
  "wrist-signal quantity [20].", body)
P("<i>B. Cardiovascular models of orthostatic stress.</i> Van Loon and "
  "colleagues developed a 21-compartment cardiovascular model for "
  "orthostatic-intolerance scenarios on travel to Mars using hydrostatic "
  "pressure, resistance, compliance, and volume conservation [7]. GRAVITY-HEART "
  "is a distinct reduced-order model with eleven fitted parameters and a "
  "narrower objective: it fits the posture responses available in PRCP and tests "
  "whether personal parameter estimation improves held-out prediction. Heldt and "
  "colleagues measured the circulatory response to posture change and released "
  "the PRCP dataset we use for fitting [8], [9].", body)
P("<i>C. Wearable heart-rate and stress inference.</i> Reiss and colleagues "
  "introduced time-frequency convolutional heart-rate estimation and the "
  "PPG-DaLiA dataset [10], [11]. Bieri and colleagues modelled heart-rate "
  "evolution as a hidden Markov process and applied belief propagation to obtain "
  "temporally consistent estimates with uncertainty [14]. We adopt the same "
  "probabilistic-tracking principle with a project-specific convolutional "
  "ensemble and report our online error alongside their published figure. "
  "Schmidt and colleagues released WESAD, a controlled laboratory stress and "
  "affect dataset, which we use to evaluate a personal-baseline classifier [12], "
  "[13].", body)

# ===========================================================================
# III. System overview
# ===========================================================================
P("III.&nbsp;&nbsp;SYSTEM OVERVIEW", h1)
figure(os.path.join(DOCS, "architecture.png"),
       "Fig. 1. Proposed SAKTI architecture. A perception layer encodes "
       "physiological, radiation, and context signals; a cognition layer reasons "
       "over clinical and operational rules; an action layer returns risk "
       "assessments, recommendations, and explanations. The deployed runtime "
       "implements the perception models and a rule-based assessment, and the "
       "encoder and reasoning stages define the development roadmap.")
P("We process PRCP, PPG-DaLiA, and WESAD in separate pipelines and keep their "
  "model outputs distinct. The deployed runtime combines the live model "
  "operations with reference-range and robust-baseline rules through a shared "
  "Rust core, astra-core, which accepts JSON inputs and dispatches the assess, "
  "gravity, ppg, and ppg_track operations. The application calls the engine "
  "natively through Tauri on the desktop and through WebAssembly in the browser, "
  "and it exposes Status, Check-in, Gravity, Wearable, Mission, and History "
  "pages. The STRESS classifier runs in the research pipeline and connects to "
  "the runtime through the same JSON interface when enabled. Local records are "
  "retained in browser storage or the desktop data store and export as JSON.", body)
P("<i>A. Suit-attached wearable.</i> The core concept is a wearable that "
  "attaches directly to the suit and reads the crew member's health output over "
  "a wired physiological bus, with no radio in the loop. An ESP32-C development "
  "board drives a round 240x240 GC9A01 display that shows status, heart rate, "
  "oxygen saturation, blood pressure, a heart-rate trend, and the next task. The "
  "firmware separates rendering from the data source behind a single interface, "
  "so the transport is a build-time choice: a direct, CRC-checked serial frame "
  "from the suit avionics for operational use, or an HTTP/JSON request over WiFi "
  "for bench demonstration only. Fig. 6 shows the demonstration wiring.", body)

# ===========================================================================
# IV. Methods (simple past)
# ===========================================================================
P("IV.&nbsp;&nbsp;METHODS", h1)
table([["Dataset", "Subjects", "Role in SAKTI"],
       ["PRCP", "10", "ECG, ABP, posture; 59 manoeuvres for fitting/evaluation"],
       ["PPG-DaLiA", "15", "Wrist BVP/PPG + 3-axis ACC; chest-ECG HR reference"],
       ["WESAD", "15", "Chest/wrist physiology for stress-state research"],
       ["NASA HRP/CSA", "\u2013", "Hazard, mechanism, and risk context (not labels)"]],
      [26 * mm, 18 * mm, 106 * mm],
      "Table I. Primary datasets and their roles.")

P("<i>A. GRAVITY-HEART: mechanistic cardiovascular model.</i> We treated the "
  "cardiovascular response to a change in gravitational loading as a "
  "reduced-order dynamical system. We defined the head-to-foot gravity input and "
  "its hydrostatic pressure scale as", body)
EQ("u(t) = (g_local / g_E) &middot; sin &phi;(t),&nbsp;&nbsp;&nbsp;"
   "&Delta;P_h(t) = &rho; g_E h &middot; u(t),")
P("with g_E = 9.80665 m/s^2, blood density &rho; = 1060 kg/m^3, an effective "
  "vessel-height term h, and a conversion of 133.322 Pa per mmHg. We represented "
  "a fast venous-pooling state V_f and a slower transcapillary-filtration state "
  "V_s by first-order dynamics driven by the gravity input:", body)
EQ("dV_f/dt = C_pool &rho; g_E h_pool u &minus; V_f / &tau;_pool,")
EQ("dV_s/dt = k_filt C_pool &rho; g_E h_pool u &minus; V_s / &tau;_filt.")
P("We formed the central stressed volume and a saturating Frank&ndash;Starling "
  "stroke-volume relation,", body)
EQ("V_cs = max(V_cs0 &minus; &Delta;V_cs &minus; V_f &minus; V_s, 20),")
EQ("SV/SV0 = [1 &minus; exp(&minus;V_cs/V_k)] / [1 &minus; exp(&minus;V_cs0/V_k)],")
P("and coupled heart rate, stroke volume, and total peripheral resistance (TPR) "
  "to mean arterial pressure (MAP):", body)
EQ("MAP(t) = MAP0 &middot; (HR/HR0) &middot; (SV/SV0) &middot; (1 + &delta;TPR) "
   "&middot; (1 &minus; v_d).")
P("Baroreflex and cardiopulmonary feedback acted through the error signal "
  "e(t) = MAP0 &minus; MAP(t) + &rho; g_E h_cs u(t), which drove saturating "
  "effector targets", body)
EQ("&delta;HR&infin; = HR_max &middot; tanh(G_HR e / HR_max),")
EQ("&delta;TPR&infin; = TPR_max &middot; tanh((G_TPR e + G_CP (V_f+V_s)/100) / TPR_max),")
P("and the effector states approached these targets with first-order time "
  "constants &tau;_HR and &tau;_TPR. During an active stand we added "
  "exponentially decaying leg-vasodilation and central-command perturbations. We "
  "fitted eleven positive parameters in log space, &theta; = log p for p = "
  "{C_pool, &tau;_pool, V_k, G_HR, &tau;_HR, G_TPR, G_CP, &tau;_TPR, A_vd, A_cc, "
  "k_filt}, under a log-normal prior centred on literature scales. We obtained a "
  "maximum-a-posteriori estimate by bounded nonlinear least squares with a "
  "pseudo-Huber loss &rho;_H on standardised residuals and an effective sample "
  "divisor &nu; that accounts for temporal autocorrelation:", body)
EQ("&theta;* = argmin_&theta; &Sigma;_d &Sigma;_k (1/&nu;)[ &rho;_H((HR&#770;&minus;HR)/&sigma;_HR)")
EQ("+ &rho;_H((MAP&#770;&minus;MAP)/&sigma;_MAP) ] + (1/2) || (&theta; &minus; &mu;)/s ||^2,")
P("with &sigma;_HR = 3 bpm, &sigma;_MAP = 4 mmHg, and &nu; = 8. We estimated "
  "parameter uncertainty from the Gauss&ndash;Newton approximation (J^T J)^+ and "
  "propagated it with residual noise to form nominal 90% intervals. We compared "
  "a zero-response baseline (Z), a 90-lag ridge finite-impulse-response predictor "
  "(E0), a population fit (E1), a personalised fit with a weak prior (E2), a "
  "personalised fit with an empirical-Bayes hierarchical prior estimated from the "
  "other participants (E3), and E3 with one calibration manoeuvre (E3-1cal). For "
  "E2 and E3 we held out the evaluated manoeuvre and calibrated on the "
  "participant's remaining manoeuvres, giving a within-participant "
  "leave-one-manoeuvre-out protocol.", body)

P("<i>B. Predicting post-mission physiological change.</i> Two adaptations "
  "dominate orthostatic tolerance after spaceflight: a reduction in plasma and "
  "intravascular volume, and a change in baroreflex gain [5], [17], [19]. We "
  "represented mission exposure by advancing the fitted model with a "
  "duration-dependent volume term and a gain-adaptation factor,", body)
EQ("&Delta;V_plasma(T) = V0 &middot; f_loss(1 &minus; exp(&minus;T/&tau;_adapt)),"
   "&nbsp;&nbsp; G_HR&#39; = &kappa;(T) G_HR,")
P("where T is mission duration, &tau;_adapt is the adaptation time constant, "
  "f_loss is the asymptotic fractional volume loss, and &kappa;(T) scales reflex "
  "gain. With the adapted volume and gain we re-simulated the stand response at "
  "the destination gravity to project the standing-MAP margin a crew member is "
  "likely to show on return to 1 g or on arrival at the Moon or Mars, together "
  "with a reconditioning time course. We treat the projections as simulations "
  "calibrated on Earth posture data and label them as such in the interface.", body)

P("<i>C. Countermeasure and medication decision support.</i> We mapped the "
  "predicted orthostatic margin to mission-approved countermeasures rather than "
  "to autonomous instructions. For a reduced margin the system surfaced graded "
  "exercise on the onboard resistive and aerobic devices with a recommended "
  "daily duration drawn from the crew protocol, pre-transition fluid and salt "
  "loading, and lower-body compression [19], [21]. Where the flight surgeon "
  "prescribes pharmacological support for orthostatic intolerance, for example "
  "midodrine or fludrocortisone, the system displays the protocol and its timing "
  "[22]. The system presents the applicable protocol and defers every "
  "prescription decision to the flight surgeon.", body)

P("<i>D. PPG-HR: spectro-temporal network and HMM.</i> We selected version v2 "
  "by its lower online leave-one-subject-out MAE. Each estimate used an "
  "eight-second wrist BVP window at 64 Hz and a synchronous three-axis "
  "accelerometer window, advanced by two seconds, with seven windows of context. "
  "The network produced a distribution over 224 heart-rate bins spanning "
  "approximately 30 to 239 bpm. We passed the distribution to a hidden Markov "
  "model whose transition probabilities were Gaussian in log-rate change, and we "
  "tracked the rate causally through the forward belief update", body)
EQ("&alpha;_t(k) &prop; p_t(k) &middot; &Sigma;_j &alpha;_{t&minus;1}(j) T(k|j),")
P("where p_t(k) is the network probability of bin k at time t and T(k|j) the "
  "transition probability. We reported forward&ndash;backward smoothing as a "
  "non-causal comparator and set interval widths by cross-subject split-conformal "
  "calibration. We evaluated the model with leave-one-subject-out splits across "
  "all 15 participants.", body)

P("<i>E. STRESS and personal baselines.</i> For a measured variable x_j we "
  "formed the personal baseline from its median m_j and a robust scale from the "
  "median absolute deviation,", body)
EQ("s_j = max(1.4826 &middot; MAD(x_j), 0.06|m_j|, 1e&minus;6),&nbsp;&nbsp; "
   "z_j = (x_j &minus; m_j)/s_j.")
P("A personal deviation could raise a status level but never lowered a "
  "range-based warning. The WESAD classifier used 60-second windows at 4 Hz with "
  "a 5-second hop, and we excluded the first 300 seconds of each held-out "
  "participant's rest from scoring to serve as personal calibration.", body)

# ===========================================================================
# V. Results (simple past for findings; present for 'Table/Fig shows')
# ===========================================================================
P("V.&nbsp;&nbsp;RESULTS", h1)
P("<i>A. GRAVITY-HEART.</i> The PRCP pipeline retained 59 manoeuvres across ten "
  "participants (20 rapid tilts, 20 slow tilts, 19 active stands). Table II "
  "reports the ablation and Fig. 2 shows it. The personalised configurations "
  "achieved the lowest held-out errors: E3 reached 6.21 bpm (HR) and 6.26 mmHg "
  "(MAP), and E2 reached 6.25 bpm and 6.31 mmHg, both well below the population "
  "fit E1 at 8.05 bpm and 7.61 mmHg. Relative to E1, E3 reduced subject-level "
  "RMSE by 1.83 bpm (Wilcoxon p = 0.002) and 1.34 mmHg (p = 0.010). The "
  "hierarchical prior acted as a useful regulariser on top of personal "
  "calibration. By manoeuvre type, E3 achieved HR/MAP RMSE of 5.65/6.18 for "
  "rapid tilt, 5.19/5.29 for slow tilt, and 7.88/7.36 for active stand, "
  "indicating that the active-stand response is the most demanding case. "
  "Cross-subject conformal calibration set the predictive intervals, which we "
  "continue to refine toward nominal coverage.", body)
table([["Method", "HR (bpm)", "MAP (mmHg)"],
       ["Z: zero response", "13.22", "7.72"],
       ["E0: population FIR", "7.92", "7.02"],
       ["E1: population physics", "8.05", "7.61"],
       ["E2: personal weak prior", "6.25", "6.31"],
       ["E3: personal hierarchical", "6.21", "6.26"],
       ["E3-1cal: one calibration", "6.43", "6.91"]],
      [70 * mm, 40 * mm, 40 * mm],
      "Table II. GRAVITY-HEART ablation (mean RMSE over held-out manoeuvres).")
figure(os.path.join(FIG, "fig1_gravity_ablation.png"),
       "Fig. 2. GRAVITY-HEART held-out-manoeuvre RMSE for HR and MAP across the "
       "ablation. Personalised fits reduced error relative to the population model.",
       maxh=70 * mm)
figure(os.path.join(FIG, "fig2_gravity_heldout_stand.png"),
       "Fig. 3. Representative held-out active-stand response: measured versus "
       "modelled HR and MAP trajectories.", maxh=70 * mm)

P("<i>B. PPG-HR.</i> Table III reports the v2 comparison and Fig. 4 shows it. "
  "The network alone reached 4.84 bpm MAE, and causal network-plus-HMM tracking "
  "reduced it to 4.46 bpm; non-causal forward&ndash;backward smoothing reached "
  "3.82 bpm. The classical spectral tracker reached 13.95 bpm. Cross-subject "
  "split-conformal calibration raised observed interval coverage to 89.8% at a "
  "mean width of 17.15 bpm, and selecting the most confident 90% and 80% of "
  "windows reduced MAE to 3.63 and 3.14 bpm. Activity-stratified error ranged "
  "from 1.72 bpm when sitting to 9.18 bpm on stairs, confirming that motion "
  "remains the dominant error source.", body)
table([["Estimator", "MAE (bpm)", "RMSE (bpm)"],
       ["Spectral argmax", "17.84", "28.16"],
       ["Classical spectral tracker", "13.95", "22.81"],
       ["Network only", "4.84", "9.84"],
       ["Network + HMM, online", "4.46", "8.66"],
       ["Network + HMM, offline", "3.82", "7.80"]],
      [70 * mm, 40 * mm, 40 * mm],
      "Table III. PPG-HR v2 results on PPG-DaLiA (15-fold leave-one-subject-out).")
figure(os.path.join(FIG, "fig4_ppg_results.png"),
       "Fig. 4. PPG-HR v2 against internal spectral and network baselines (left) "
       "and causal online MAE by activity (right).", maxh=70 * mm)

P("<i>C. STRESS.</i> Table IV reports the binary classification and Fig. 5 shows "
  "it. The personal-baseline network was the strongest model in both sensor "
  "configurations, reaching macro-F1 0.952 (balanced accuracy 0.960, AUROC "
  "0.992) on chest signals and 0.919 (balanced accuracy 0.932, AUROC 0.980) on "
  "wrist signals. Personal-baseline calibration improved on the population "
  "LightGBM model, although variability across participants remained "
  "substantial.", body)
table([["Model", "Chest", "Wrist"],
       ["LightGBM, population", "0.911", "0.877"],
       ["LightGBM, personal", "0.919", "0.903"],
       ["1-D CNN, personal", "0.952", "0.919"]],
      [70 * mm, 40 * mm, 40 * mm],
      "Table IV. WESAD binary classification: subject-fold mean macro-F1.")
figure(os.path.join(FIG, "fig6_stress_results.png"),
       "Fig. 5. WESAD binary stress-versus-non-stress macro-F1 across "
       "leave-one-subject-out folds for chest and wrist channels.", maxh=70 * mm)

P("<i>D. Robustness and hardware.</i> The repository recorded 13 of 13 "
  "edge-case checks as passing, covering zero-gravity invariance, monotonic "
  "response across gravity settings, bounded output under extreme inputs, "
  "Python/Rust numerical agreement below 0.013, finite output for flat PPG, HMM "
  "normalisation, resistance to a single spectral outlier, increased uncertainty "
  "under corrupted PPG, missing-channel handling, and calibration-window "
  "exclusion. The PPG-HR network held 234,945 trainable parameters; a "
  "single-thread host benchmark recorded about 9.25 ms per network window and "
  "0.14 ms per HMM update. The bench prototype comprised an ESP32-C development "
  "board, a round GC9A01 SPI display, four buttons, and USB-C power, wired as in "
  "Fig. 6. The display rendered a green status screen, a body-system view, and a "
  "red multi-system recommendation screen.", body)
figure(os.path.join(DOCS, "hardware-wiring.jpg"),
       "Fig. 6. SAKTI prototype electronics: the ESP32-C board drives a round "
       "GC9A01 SPI display over hardware SPI, with four buttons to ground and "
       "USB-C power. WiFi serves only for demonstration; the operational wearable "
       "reads the suit bus directly.", maxh=92 * mm)

# ===========================================================================
# VI. Discussion (present tense)
# ===========================================================================
P("VI.&nbsp;&nbsp;DISCUSSION", h1)
P("The results support a modular design in which each signal family is handled "
  "by a model matched to its data and labels. GRAVITY-HEART's personalised fits "
  "reduce mean error relative to the population model on held-out PRCP "
  "manoeuvres, and the model's physical structure lets it extrapolate to "
  "destination gravities and to post-mission adaptation states. PPG-HR combines "
  "a convolutional distribution with belief tracking to produce causal estimates "
  "and calibrated intervals; its online error is close to the published "
  "BeliefPPG figure of 3.57 bpm [14], and its contribution is the deployed "
  "signal pipeline and uncertainty gating. The WESAD result shows that personal "
  "calibration supports subject-wise laboratory stress classification. The "
  "suit-attached wearable keeps the operational data path wired and local, which "
  "removes the wireless attack surface that the demonstration WiFi link carries. "
  "The post-mission projection and the countermeasure mapping turn the "
  "mechanistic model into actionable, protocol-anchored decision support while "
  "leaving prescription to the flight surgeon.", body)
P("Moon and Mars scenarios use the gravitational accelerations g_Moon = 1.625 "
  "m/s^2 and g_Mars = 3.721 m/s^2 as model inputs, so the resulting curves are "
  "deterministic extrapolations from Earth posture data. We label them as "
  "simulations throughout the interface, and we present the plasma-volume and "
  "reflex-gain adaptations as modelling assumptions anchored to the "
  "approximately 15% intravascular-volume adaptation that NASA describes [5].", body)

# ===========================================================================
# VII. Validation roadmap
# ===========================================================================
P("VII.&nbsp;&nbsp;VALIDATION ROADMAP", h1)
P("We define the path to operational readiness. The next steps are external "
  "evaluation on approved bed-rest, centrifuge, and spaceflight datasets; "
  "prospective protocol testing; sensor-specific calibration; demographic and "
  "mission-condition subgroup analysis; recalibration of predictive uncertainty "
  "toward nominal coverage; clinical review of thresholds and recommendations by "
  "aerospace-medicine specialists; human-factors evaluation of the wearable; "
  "radiation and electromagnetic-compatibility testing of the hardware; and a "
  "cybersecurity and privacy review. Standard Measures and CIPHER provide models "
  "of longitudinal collection that could support this validation subject to "
  "access and approval [4], [6]. The system supports clinical decisions; it does "
  "not issue a diagnosis, prescribe medication, or replace a flight surgeon.", body)

# ===========================================================================
# VIII. Reproducibility
# ===========================================================================
P("VIII.&nbsp;&nbsp;REPRODUCIBILITY AND DATA AVAILABILITY", h1)
P("We maintain the implementation, training scripts, notebook, model artifacts, "
  "metrics, firmware, and application source in the public repository at "
  "https://github.com/HarshPrajapati7/Shakti. The notebook loads the committed "
  "evaluation artifacts in its default non-training mode, and the training "
  "scripts reproduce each module from its stored configuration. The datasets are "
  "available from their official sources under their respective licences: "
  "PhysioNet PRCP [9]; PPG-DaLiA (CC BY 4.0) [11]; and WESAD (non-commercial "
  "research) [13]. Researchers download each dataset from its source and comply "
  "with the corresponding licence and citation terms.", body)

# ===========================================================================
# IX. Conclusion
# ===========================================================================
P("IX.&nbsp;&nbsp;CONCLUSION", h1)
P("We described SAKTI, a modular astronaut health-monitoring system that "
  "combines a mechanistic cardiovascular model, uncertainty-aware wearable "
  "heart-rate estimation, a personal-baseline stress classifier, a local "
  "application runtime, and a suit-attached wearable display. The personalised "
  "cardiovascular fit reduced held-out posture-response error, the heart-rate "
  "model improved substantially over classical baselines, and the "
  "personal-baseline network reached a macro-F1 of 0.952 on chest signals and "
  "0.919 on wrist signals. The mechanistic model extends naturally to projecting "
  "post-mission orthostatic responses and to anchoring mission-approved "
  "countermeasures. The evidence rests on Earth-based data, and our defined next "
  "step is external validation with approved spaceflight and analog datasets "
  "under clinician-reviewed protocols.", body)

# ===========================================================================
# References
# ===========================================================================
P("REFERENCES", h1)
refs = [
 '[1] NASA Space Apps Challenge, "Create Health Monitoring Software for '
 'Astronauts on Space Missions," 2026.',
 '[2] NASA Human Research Program, "Five Hazards of Human Spaceflight." '
 'https://www.nasa.gov/hrp/hazards/.',
 '[3] NASA Human Research Program, "Risks of Human Spaceflight." '
 'https://www.nasa.gov/hrp/risks/.',
 '[4] NASA Human Research Program, "Ongoing HRP Research in Space." '
 'https://www.nasa.gov/hrp/ongoing-hrp-research/.',
 '[5] NASA Office of the Chief Health and Medical Officer, "Orthostatic '
 'Intolerance," OCHMO-TB-019 Rev. A, 2022.',
 '[6] NASA, "CIPHER: Complement of Integrated Protocols for Human Exploration '
 'Research." https://www.nasa.gov/reference/cipher/.',
 '[7] L. M. van Loon et al., "Computational modeling of orthostatic intolerance '
 'for travel to Mars," npj Microgravity, vol. 8, art. 34, 2022, '
 'doi:10.1038/s41526-022-00219-2.',
 '[8] T. Heldt et al., "Circulatory response to passive and active changes in '
 'posture," Computers in Cardiology, vol. 30, pp. 263-266, 2003.',
 '[9] T. Heldt and R. Mark, "Physiologic Response to Changes in Posture (PRCP), '
 'v1.0.0," PhysioNet, 2016, doi:10.13026/C2PC7R.',
 '[10] A. Reiss et al., "Deep PPG: Large-scale heart rate estimation with '
 'convolutional neural networks," Sensors, vol. 19, no. 14, art. 3079, 2019, '
 'doi:10.3390/s19143079.',
 '[11] A. Reiss et al., "PPG-DaLiA," UCI Machine Learning Repository, 2019, '
 'doi:10.24432/C53890.',
 '[12] P. Schmidt et al., "Introducing WESAD, a multimodal dataset for wearable '
 'stress and affect detection," Proc. ACM ICMI, pp. 400-408, 2018, '
 'doi:10.1145/3242969.3242985.',
 '[13] P. Schmidt et al., "WESAD: Wearable Stress and Affect Detection," UCI '
 'Machine Learning Repository, 2018.',
 '[14] V. Bieri et al., "BeliefPPG: Uncertainty-aware heart rate estimation from '
 'PPG signals via belief propagation," Proc. UAI, PMLR vol. 216, pp. 173-183, '
 '2023.',
 '[15] NASA, NASA Publications Guide for Authors, NASA/SP-2015-7602/REV 2, 2015.',
 '[16] IEEE Author Center, "Structure Your Article."',
 '[17] A. R. Hargens and S. Richardson, "Cardiovascular adaptations, fluid '
 'shifts, and countermeasures related to space flight," Respiratory Physiology '
 '& Neurobiology, vol. 169, suppl., pp. S30-S33, 2009.',
 '[18] A. G. Lee et al., "Spaceflight associated neuro-ocular syndrome (SANS) '
 'and the neuro-ophthalmologic effects of microgravity," Eye and Brain, vol. 10, '
 'pp. 73-85, 2018.',
 '[19] Q. Fu et al., "Impact of prolonged spaceflight on orthostatic tolerance '
 'and cardiovascular regulation," Circulation, vol. 140, no. 9, pp. 729-738, '
 '2019.',
 '[20] F. A. Cucinotta and M. Durante, "Cancer risk from exposure to galactic '
 'cosmic rays: implications for space exploration," The Lancet Oncology, vol. 7, '
 'no. 5, pp. 431-435, 2006.',
 '[21] J. A. Loehr et al., "Musculoskeletal adaptations to training with the '
 'advanced resistive exercise device (ARED)," Medicine & Science in Sports & '
 'Exercise, vol. 43, no. 1, pp. 146-156, 2011.',
 '[22] C. D. Ramsdell et al., "Midodrine prevents orthostatic intolerance '
 'associated with simulated spaceflight," Journal of Applied Physiology, vol. 90, '
 'no. 6, pp. 2245-2248, 2001.',
]
for r in refs:
    P(r, ref)

# ---------------------------------------------------------------------------
doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=18 * mm, rightMargin=18 * mm,
                        topMargin=16 * mm, bottomMargin=16 * mm,
                        title="SAKTI (ASTRA-HEALTH) Research Paper",
                        author="Harsh Prajapati, Jatin Pandey, Arpit")
doc.build(story)
print("wrote", OUT)
