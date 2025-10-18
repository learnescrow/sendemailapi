import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Determine if running locally or in production
const isDev = process.env.NODE_ENV === "development";

// Dynamic imports for Puppeteer (helps with bundle size)
async function getBrowser() {
  if (isDev) {
    // Local development - use regular puppeteer
    const puppeteer = await import("puppeteer");
    return puppeteer.default.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ],
    });
  } else {
    // Production - use puppeteer-core with chromium
    const puppeteerCore = await import("puppeteer-core");
    const chromium = await import("@sparticuz/chromium");
    
    // Set binary path for brotli decompression
    if (process.env.AWS_EXECUTION_ENV) {
      chromium.default.setGraphicsMode = false;
    }
    
    return puppeteerCore.default.launch({
      args: [
        ...chromium.default.args,
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
      ],
      executablePath: await chromium.default.executablePath(),
      headless: true,
    });
  }
}

export async function POST(req: Request) {
  let browser = null;

  try {
    // Parse and validate request body
    const body = await req.json();
    const { email, subject, html, generatePdf } = body;

    // Validation
    if (!email || !subject || !html) {
      return NextResponse.json(
        { 
          error: "Missing required fields",
          details: "email, subject, and html are required" 
        },
        { 
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" }
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emails = email.split(",").map((e: string) => e.trim());
    const invalidEmails = emails.filter((e: string) => !emailRegex.test(e));
    
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { 
          error: "Invalid email format",
          details: `Invalid emails: ${invalidEmails.join(", ")}` 
        },
        { 
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" }
        }
      );
    }

    const attachments: Array<{
      filename: string;
      content: string;
    }> = [];

    // Generate PDF if requested
    if (generatePdf) {
      console.log("📄 Starting PDF generation...");

      try {
        // Launch browser with appropriate settings
        browser = await getBrowser();

        console.log("✅ Browser launched successfully");

        const page = await browser.newPage();

        // Set viewport for consistent rendering
        await page.setViewport({
          width: 1920,
          height: 1080,
          deviceScaleFactor: 2,
        });

        // Improved HTML template with proper styling
        const styledHtml = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                padding: 40px;
                background: white;
              }
              h1, h2, h3, h4, h5, h6 {
                margin-bottom: 16px;
                color: #1a1a1a;
              }
              p {
                margin-bottom: 12px;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
              }
              th, td {
                padding: 12px;
                text-align: left;
                border: 1px solid #ddd;
              }
              th {
                background-color: #f5f5f5;
                font-weight: 600;
              }
              img {
                max-width: 100%;
                height: auto;
              }
              @media print {
                body {
                  padding: 20px;
                }
              }
            </style>
          </head>
          <body>
            ${html}
          </body>
          </html>
        `;

        // Load content with proper wait conditions
        await page.setContent(styledHtml, {
          waitUntil: ["load", "networkidle0"],
          timeout: 30000,
        });

        console.log("✅ Content loaded successfully");

        // Wait a bit for any dynamic content
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Generate PDF with optimized settings
        const pdfBuffer = await page.pdf({
          format: "A4",
          printBackground: true,
          preferCSSPageSize: false,
          displayHeaderFooter: false,
          margin: {
            top: "20mm",
            right: "15mm",
            bottom: "20mm",
            left: "15mm",
          },
          timeout: 60000,
        });

        console.log(`✅ PDF generated successfully (${pdfBuffer.length} bytes)`);

        // Verify PDF buffer is valid
        if (!pdfBuffer || pdfBuffer.length === 0) {
          throw new Error("Generated PDF buffer is empty");
        }

        // Verify PDF magic number (should start with %PDF)
        const pdfHeader = Buffer.from(pdfBuffer.slice(0, 4)).toString('utf8');
        if (pdfHeader !== '%PDF') {
          throw new Error("Generated buffer is not a valid PDF");
        }

        // Create safe filename
        const safeFilename = subject
          .replace(/[^a-z0-9\s-]/gi, "")
          .replace(/\s+/g, "_")
          .substring(0, 50) || "document";

        // Attach PDF to email - Resend requires base64 string
        const base64Content = Buffer.from(pdfBuffer).toString('base64');
        
        attachments.push({
          filename: `${safeFilename}.pdf`,
          content: base64Content,
        });

        console.log(`✅ PDF attached to email (filename: ${safeFilename}.pdf, size: ${pdfBuffer.length} bytes, base64 length: ${base64Content.length})`);

      } catch (pdfError) {
        console.error("❌ PDF Generation Error:", pdfError);
        
        // Close browser if open
        if (browser) {
          await browser.close().catch(console.error);
        }

        return NextResponse.json(
          {
            error: "Failed to generate PDF",
            details: pdfError instanceof Error ? pdfError.message : "Unknown PDF error",
          },
          {
            status: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
          }
        );
      } finally {
        // Ensure browser is closed
        if (browser) {
          await browser.close().catch(console.error);
          console.log("✅ Browser closed");
        }
      }
    }

    // Send email via Resend
    console.log("📧 Sending email...");
    console.log("Attachments array:", JSON.stringify(attachments.map(a => ({
      filename: a.filename,
      contentLength: a.content.length,
      contentType: typeof a.content
    })), null, 2));
    
    const emailResult = await resend.emails.send({
      from: "noreply@noreply.capitalflasher.com",
      to: emails,
      subject,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    console.log("📤 Email API Response:", emailResult);

    // Check for Resend errors
    if (emailResult.error) {
      throw new Error(`Resend API Error: ${JSON.stringify(emailResult.error)}`);
    }

    return NextResponse.json(
      {
        success: true,
        emailSent: true,
        pdfAttached: generatePdf,
        emailId: emailResult.data?.id,
        message: "Email sent successfully",
      },
      {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );

  } catch (error: unknown) {
    console.error("❌ API Error:", error);

    // Ensure browser cleanup on any error
    if (browser) {
      await browser.close().catch(console.error);
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: "Email send failed",
        details: errorMessage,
        ...(isDev && { stack: errorStack }),
      },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}

// Handle preflight CORS requests
export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    }
  );
}