"use client";

import dynamic from "next/dynamic";

const Tesseract = dynamic(() => import("../components/Tesseract"), {
  ssr: false,
});

export default function Page() {
  return (
    <main className="home">
      <p className="home-top-text">Independent Developer</p>

      <div className="tesseract-layer">
        <Tesseract />
      </div>

      <h1 className="home-title" aria-label="Shanzhy">
        {"Shanzhy".split("").map((letter, index) => (
          <span className="title-letter-mask" aria-hidden="true" key={index}>
            <span className="title-letter">{letter}</span>
          </span>
        ))}
      </h1>

      <button className="home-start" type="button">
        Click here to start
      </button>
      
      <p className="home-bottom-text">Edmonton, Canada</p>
    </main>
  );
}