import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email, subject, html } = await req.json();

    if (!email || !subject || !html) {
      return NextResponse.json(
        { error: "Missing fields: email, subject, html are required" },
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    // ✅ Send to the client email provided
    const result = await resend.emails.send({
      from: "CivilRaw <noreply@noreply.capitalflasher.com>", // verified sender
      to: email, // dynamic recipient
      subject,
      html,
    });

    return NextResponse.json(
      { success: true, emailSent: !result.error },
      {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error sending email";

    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}

// ✅ Handle preflight CORS requests
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    }
  );
}
