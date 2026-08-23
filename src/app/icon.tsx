import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1c1b18",
          color: "#f4efe6",
          fontSize: 220,
          fontWeight: 700,
          letterSpacing: -8,
        }}
      >
        SH
      </div>
    ),
    size,
  );
}
