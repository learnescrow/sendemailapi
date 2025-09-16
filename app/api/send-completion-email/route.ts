import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { name, email, projectName } = await req.json();

    if (!name || !email || !projectName) {
      return NextResponse.json(
        { error: "Missing fields" },
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    // ✅ Send ONLY to the client
    const clientResult = await resend.emails.send({
      from: "noreply@noreply.capitalflasher.com", // your verified sender
      to: email, // client email from form
      subject: `Your Project "${projectName}" is Completed`,
      html: `
        <h2>Congratulations 🎉</h2>
        <p>Hi ${name},</p>
        <p>Your project <strong>${projectName}</strong> has been successfully completed.</p>
        <p>Thank you for working with us!</p>
      `,
    });

    return NextResponse.json(
      { success: true, clientEmailSent: !clientResult.error },
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
