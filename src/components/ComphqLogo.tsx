"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const RING_CIRCUMFERENCE = 2 * Math.PI * 190;
const LINE_V_LENGTH = 380;
const LINE_H_LENGTH = 140;

export function ComphqLogo() {
  const svgRef = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline();

      tl.from("#chq-bg", { opacity: 0, duration: 0.4, ease: "power2.out" }, 0);

      tl.fromTo(
        "#chq-line-v",
        { strokeDasharray: LINE_V_LENGTH, strokeDashoffset: LINE_V_LENGTH },
        { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" },
        0.2,
      );

      tl.fromTo(
        "#chq-line-h",
        { strokeDasharray: LINE_H_LENGTH, strokeDashoffset: LINE_H_LENGTH },
        { strokeDashoffset: 0, duration: 0.4, ease: "power2.inOut" },
        0.45,
      );

      tl.from(
        ["#chq-C", "#chq-O", "#chq-M", "#chq-P"],
        { opacity: 0, y: -80, duration: 0.45, stagger: 0.09, ease: "back.out(1.7)" },
        0.5,
      );

      tl.from(
        ["#chq-H", "#chq-Q"],
        { opacity: 0, x: 80, duration: 0.5, stagger: 0.07, ease: "back.out(1.5)" },
        0.95,
      );

      tl.from(
        ["#chq-podium-3", "#chq-podium-3-label"],
        { opacity: 0, y: 100, duration: 0.45, ease: "back.out(1.6)" },
        1.45,
      );

      tl.from(
        ["#chq-podium-2", "#chq-podium-2-label"],
        { opacity: 0, y: 100, duration: 0.45, ease: "back.out(1.6)" },
        1.6,
      );

      tl.from(
        ["#chq-podium-1", "#chq-podium-1-label"],
        { opacity: 0, y: 100, duration: 0.65, ease: "bounce.out" },
        1.78,
      );

      tl.fromTo(
        "#chq-podium-1",
        { scaleX: 1.12, scaleY: 0.9 },
        {
          scaleX: 1,
          scaleY: 1,
          duration: 0.3,
          ease: "elastic.out(1, 0.4)",
          transformOrigin: "50% 100%",
        },
        2.43,
      );

      tl.fromTo(
        "#chq-ring",
        { strokeDasharray: RING_CIRCUMFERENCE, strokeDashoffset: RING_CIRCUMFERENCE },
        { strokeDashoffset: 0, duration: 0.55, ease: "power3.out" },
        2.5,
      );
    },
    { scope: svgRef },
  );

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-label="comphq logo"
    >
      <defs>
        <clipPath id="chq-circle-clip">
          <circle cx="200" cy="200" r="190" />
        </clipPath>
      </defs>

      <g clipPath="url(#chq-circle-clip)">
        <rect id="chq-bg" x="0" y="0" width="400" height="400" fill="#0f0f0f" />

        <line
          id="chq-line-v"
          x1="148" y1="10" x2="148" y2="390"
          stroke="#f97316" strokeWidth="3" opacity="0.5"
        />
        <line
          id="chq-line-h"
          x1="10" y1="280" x2="148" y2="280"
          stroke="#f97316" strokeWidth="3" opacity="0.5"
        />

        <text id="chq-C" x="90" y="88" textAnchor="middle" fill="#ffffff"
          style={{ fontWeight: 900, fontSize: "56px", fontFamily: "Arial Black, Arial, sans-serif" }}>C</text>
        <text id="chq-O" x="90" y="148" textAnchor="middle" fill="#ffffff"
          style={{ fontWeight: 900, fontSize: "56px", fontFamily: "Arial Black, Arial, sans-serif" }}>O</text>
        <text id="chq-M" x="90" y="208" textAnchor="middle" fill="#ffffff"
          style={{ fontWeight: 900, fontSize: "56px", fontFamily: "Arial Black, Arial, sans-serif" }}>M</text>
        <text id="chq-P" x="90" y="268" textAnchor="middle" fill="#f97316"
          style={{ fontWeight: 900, fontSize: "56px", fontFamily: "Arial Black, Arial, sans-serif" }}>P</text>

        <text id="chq-H" x="165" y="175" textAnchor="start" fill="#ffffff"
          style={{ fontWeight: 900, fontSize: "108px", fontFamily: "Arial Black, Arial, sans-serif" }}>H</text>
        <text id="chq-Q" x="248" y="175" textAnchor="start" fill="#f97316"
          style={{ fontWeight: 900, fontSize: "108px", fontFamily: "Arial Black, Arial, sans-serif" }}>Q</text>

        <rect id="chq-podium-2" x="152" y="310" width="52" height="80" fill="#4b5563" rx="3" />
        <text id="chq-podium-2-label" x="178" y="358" textAnchor="middle" fill="#d1d5db"
          style={{ fontWeight: 700, fontSize: "18px", fontFamily: "Arial, sans-serif" }}>2</text>

        <rect id="chq-podium-1" x="207" y="280" width="58" height="110" fill="#f97316" rx="3" />
        <text id="chq-podium-1-label" x="236" y="340" textAnchor="middle" fill="white"
          style={{ fontWeight: 900, fontSize: "22px", fontFamily: "Arial Black, Arial, sans-serif" }}>1</text>

        <rect id="chq-podium-3" x="268" y="330" width="50" height="60" fill="#374151" rx="3" />
        <text id="chq-podium-3-label" x="293" y="366" textAnchor="middle" fill="#9ca3af"
          style={{ fontWeight: 700, fontSize: "18px", fontFamily: "Arial, sans-serif" }}>3</text>
      </g>

      <circle
        id="chq-ring"
        cx="200" cy="200" r="190"
        fill="none"
        stroke="#f97316"
        strokeWidth="6"
      />
    </svg>
  );
}
