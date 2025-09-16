import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { name, email, projectName } = await req.json();

    if (!name || !email || !projectName) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    console.log("Sending email with:", { name, email, projectName });

    // Send to Admin
    const adminResult = await resend.emails.send({
      from: "noreply@noreply.capitalflasher.com", // ✅ your verified domain
      to: "ganeshwebby@gmail.com",     // replace with your admin email
      subject: `Project Completed: ${projectName}`,
      html: `
        <h2>Project Completed</h2>
        <p><strong>Project:</strong> ${projectName}</p>
        <p><strong>Client Name:</strong> ${name}</p>
        <p><strong>Client Email:</strong> ${email}</p>
      `,
    });

    console.log("Admin email result:", adminResult);

    // Send to Client
    const clientResult = await resend.emails.send({
      from: "noreply@noreply.capitalflasher.com",
      to: email,
      subject: `Your Project "${projectName}" is Completed`,
      html: `
        <h2>Congratulations 🎉</h2>
        <p>Your project <strong>${projectName}</strong> has been successfully completed.</p>
        <p>Thank you for working with us!</p>
      `,
    });

    console.log("Client email result:", clientResult);

    return NextResponse.json({ success: true, adminResult, clientResult });
  }  catch (error: unknown) {
  if (error instanceof Error) {
    console.error("Resend Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.error("Unknown error:", error);
  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
}
