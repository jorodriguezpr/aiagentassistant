/**
 * AI Agent Assistant (AiAgentAssistant)
 * PDF Skills - Generate and manage PDF documents
 * 
 * @author Jose Rodriguez Arroyo
 * @email jrpcone@gmail.com
 * @github https://github.com/jorodriguezpr/
 */

import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import logger from '../utils/logger';

/**
 * PDF Generation Configuration
 */
export interface PDFGenerationOptions {
  title?: string;
  author?: string;
  subject?: string;
  fontSize?: number;
  pageSize?: string;
  margins?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

/**
 * PDF Result Interface
 */
export interface PDFGenerationResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  error?: string;
  message: string;
  downloadUrl?: string;
}

/**
 * Output directory for generated PDFs
 * Creates directory if it doesn't exist
 */
function getOutputDirectory(): string {
  const outputDir = path.join(process.env.HOME || '/tmp', '.config', 'aiagentassistant', 'pdfs');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true, mode: 0o755 });
  }
  
  return outputDir;
}

/**
 * Generate a unique filename for PDF
 */
function generateFileName(baseName?: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const fileName = baseName || 'document';
  return `${fileName}_${timestamp}_${randomId}.pdf`;
}

/**
 * Generate PDF from text content
 */
export async function generateTextPDF(
  content: string,
  options: PDFGenerationOptions = {}
): Promise<PDFGenerationResult> {
  logger.info({ contentLength: content.length }, 'Generating PDF from text content');

  try {
    const outputDir = getOutputDirectory();
    const fileName = generateFileName('text-document');
    const filePath = path.join(outputDir, fileName);

    // Create PDF document
    const doc = new PDFDocument({
      size: (options.pageSize || 'Letter') as any,
      margin: options.margins?.top || 50,
    });

    // Add metadata
    if (options.title) {
      (doc as any).info = (doc as any).info || {};
      (doc as any).info.Title = options.title;
    }
    if (options.author) {
      (doc as any).info = (doc as any).info || {};
      (doc as any).info.Author = options.author;
    }

    // Create write stream
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Add title if provided
    if (options.title) {
      doc.fontSize(20).font('Helvetica-Bold').text(options.title, { align: 'center' });
      doc.moveDown(0.5);
      doc.strokeColor('#CCCCCC').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);
    }

    // Add content
    const fontSize = options.fontSize || 12;
    doc.fontSize(fontSize).font('Helvetica').text(content, {
      align: 'left',
      width: 500,
    });

    // Add footer with timestamp
    doc.fontSize(10).fillColor('#666666').text(
      `Generated on ${new Date().toLocaleString()}`,
      50,
      700,
      { align: 'center' }
    );

    // Finalize PDF
    doc.end();

    return new Promise((resolve) => {
      stream.on('finish', () => {
        const stats = fs.statSync(filePath);
        logger.info({ filePath, fileSize: stats.size }, 'Text PDF generated successfully');

        resolve({
          success: true,
          filePath,
          fileName,
          fileSize: stats.size,
          message: `✅ PDF generated successfully: ${fileName}`,
        });
      });

      stream.on('error', (error) => {
        logger.error({ error: error.message }, 'Error writing PDF to stream');
        resolve({
          success: false,
          error: error.message,
          message: `❌ Failed to generate PDF: ${error.message}`,
        });
      });
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error generating text PDF');
    return {
      success: false,
      error: error.message,
      message: `❌ Error generating PDF: ${error.message}`,
    };
  }
}

/**
 * Generate PDF from HTML content
 */
export async function generateHTMLPDF(
  htmlContent: string,
  options: PDFGenerationOptions = {}
): Promise<PDFGenerationResult> {
  logger.info({ contentLength: htmlContent.length }, 'Generating PDF from HTML content');

  try {
    const outputDir = getOutputDirectory();
    const fileName = generateFileName('html-document');
    const filePath = path.join(outputDir, fileName);

    // Create PDF document
    const doc = new PDFDocument({
      size: (options.pageSize || 'Letter') as any,
      margin: options.margins?.top || 50,
    });

    // Add metadata
    if (options.title) {
      (doc as any).info = (doc as any).info || {};
      (doc as any).info.Title = options.title;
    }
    if (options.author) {
      (doc as any).info = (doc as any).info || {};
      (doc as any).info.Author = options.author;
    }

    // Create write stream
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Strip HTML tags and convert HTML entities
    const plainText = htmlContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&bull;/g, '•')
      .replace(/&hellip;/g, '...')
      .trim();

    // Add title if provided
    if (options.title) {
      doc.fontSize(18).font('Helvetica-Bold').text(options.title, { align: 'center' });
      doc.moveDown(0.5);
      doc.strokeColor('#0066CC').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);
    }

    // Add content
    const fontSize = options.fontSize || 11;
    doc.fontSize(fontSize).font('Helvetica').text(plainText, {
      align: 'left',
      width: 500,
    });

    // Add footer
    doc.fontSize(9).fillColor('#999999').text(
      `Generated on ${new Date().toLocaleString()}`,
      50,
      700,
      { align: 'center' }
    );

    // Finalize PDF
    doc.end();

    return new Promise((resolve) => {
      stream.on('finish', () => {
        const stats = fs.statSync(filePath);
        logger.info({ filePath, fileSize: stats.size }, 'HTML PDF generated successfully');

        resolve({
          success: true,
          filePath,
          fileName,
          fileSize: stats.size,
          message: `✅ PDF generated from HTML: ${fileName}`,
        });
      });

      stream.on('error', (error) => {
        logger.error({ error: error.message }, 'Error writing HTML PDF to stream');
        resolve({
          success: false,
          error: error.message,
          message: `❌ Failed to generate PDF: ${error.message}`,
        });
      });
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error generating HTML PDF');
    return {
      success: false,
      error: error.message,
      message: `❌ Error generating PDF: ${error.message}`,
    };
  }
}

/**
 * Generate PDF from web page content
 * Expects content to be already fetched
 */
export async function generateWebPagePDF(
  pageTitle: string,
  pageUrl: string,
  pageContent: string,
  options: PDFGenerationOptions = {}
): Promise<PDFGenerationResult> {
  logger.info({ pageUrl, contentLength: pageContent.length }, 'Generating PDF from web page');

  try {
    const outputDir = getOutputDirectory();
    const baseName = pageTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const fileName = generateFileName(baseName);
    const filePath = path.join(outputDir, fileName);

    // Create PDF document
    const doc = new PDFDocument({
      size: (options.pageSize || 'Letter') as any,
      margin: options.margins?.top || 50,
    });

    // Add metadata
    (doc as any).info = (doc as any).info || {};
    (doc as any).info.Title = pageTitle || 'Web Page';
    (doc as any).info.Subject = `Web page from: ${pageUrl}`;
    if (options.author) {
      (doc as any).info.Author = options.author;
    }

    // Create write stream
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Add header with page title
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#0066CC').text(pageTitle || 'Web Page', {
      align: 'left',
    });
    doc.moveDown(0.3);

    // Add URL
    doc.fontSize(9).fillColor('#666666').text(`Source: ${pageUrl}`, {
      align: 'left',
      link: pageUrl,
    });
    doc.underline(50, doc.y - 12, 450, 12);
    doc.moveDown(0.5);

    // Add separator
    doc.strokeColor('#DDDDDD').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // Clean and add content
    const cleanContent = pageContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    const fontSize = options.fontSize || 11;
    doc.fontSize(fontSize).font('Helvetica').fillColor('#000000').text(cleanContent, {
      align: 'left',
      width: 500,
    });

    // Add footer with page number
    doc.fontSize(9).fillColor('#999999').text(
      `Generated on ${new Date().toLocaleString()}`,
      50,
      760,
      { align: 'center' }
    );

    // Finalize PDF
    doc.end();

    return new Promise((resolve) => {
      stream.on('finish', () => {
        const stats = fs.statSync(filePath);
        logger.info({ filePath, fileSize: stats.size }, 'Web page PDF generated successfully');

        resolve({
          success: true,
          filePath,
          fileName,
          fileSize: stats.size,
          message: `✅ PDF generated from web page: ${fileName}`,
        });
      });

      stream.on('error', (error) => {
        logger.error({ error: error.message }, 'Error writing web page PDF to stream');
        resolve({
          success: false,
          error: error.message,
          message: `❌ Failed to generate PDF: ${error.message}`,
        });
      });
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error generating web page PDF');
    return {
      success: false,
      error: error.message,
      message: `❌ Error generating PDF: ${error.message}`,
    };
  }
}

/**
 * Generate styled report PDF (for structured data)
 */
export async function generateReportPDF(
  reportTitle: string,
  reportData: {
    sections: Array<{
      heading: string;
      content: string;
    }>;
    summary?: string;
  },
  options: PDFGenerationOptions = {}
): Promise<PDFGenerationResult> {
  logger.info({ reportTitle, sectionCount: reportData.sections.length }, 'Generating report PDF');

  try {
    const outputDir = getOutputDirectory();
    const fileName = generateFileName('report');
    const filePath = path.join(outputDir, fileName);

    // Create PDF document
    const doc = new PDFDocument({
      size: (options.pageSize || 'Letter') as any,
      margin: 50,
    });

    // Add metadata
    (doc as any).info = (doc as any).info || {};
    (doc as any).info.Title = reportTitle;
    (doc as any).info.Author = options.author || 'AI Agent Assistant';
    (doc as any).info.Subject = options.subject || 'Generated Report';

    // Create write stream
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Add main title
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#0066CC').text(reportTitle, {
      align: 'center',
    });
    doc.moveDown(0.3);

    // Add timestamp
    doc.fontSize(10).fillColor('#666666').text(
      `Generated: ${new Date().toLocaleString()}`,
      { align: 'center' }
    );
    doc.moveDown(1);

    // Add separator
    doc.strokeColor('#0066CC').moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(1);

    // Add summary if provided
    if (reportData.summary) {
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#333333').text('Summary', {
        align: 'left',
      });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').fillColor('#000000').text(reportData.summary, {
        align: 'left',
        width: 500,
      });
      doc.moveDown(1);
    }

    // Add sections
    reportData.sections.forEach((section) => {
      // Check if we need a new page
      if (doc.y > 650) {
        doc.addPage();
      }

      // Section heading
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0066CC').text(section.heading, {
        align: 'left',
      });
      doc.moveDown(0.2);

      // Section content
      doc.fontSize(11).font('Helvetica').fillColor('#000000').text(section.content, {
        align: 'left',
        width: 500,
      });
      doc.moveDown(0.8);
    });

    // Add footer
    doc.fontSize(9).fillColor('#999999').text(
      `Page 1`,
      50,
      760,
      { align: 'center' }
    );

    // Finalize PDF
    doc.end();

    return new Promise((resolve) => {
      stream.on('finish', () => {
        const stats = fs.statSync(filePath);
        logger.info(
          { filePath, fileSize: stats.size },
          'Report PDF generated successfully'
        );

        resolve({
          success: true,
          filePath,
          fileName,
          fileSize: stats.size,
          message: `✅ Report PDF generated: ${fileName} (${reportData.sections.length} sections)`,
        });
      });

      stream.on('error', (error) => {
        logger.error({ error: error.message }, 'Error writing report PDF to stream');
        resolve({
          success: false,
          error: error.message,
          message: `❌ Failed to generate PDF: ${error.message}`,
        });
      });
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error generating report PDF');
    return {
      success: false,
      error: error.message,
      message: `❌ Error generating PDF: ${error.message}`,
    };
  }
}

/**
 * List all generated PDFs
 */
export function listGeneratedPDFs(): {
  count: number;
  pdfs: Array<{
    fileName: string;
    filePath: string;
    fileSize: number;
    createdAt: Date;
  }>;
} {
  logger.info('Listing generated PDFs');

  try {
    const outputDir = getOutputDirectory();
    const files = fs.readdirSync(outputDir);
    const pdfFiles = files
      .filter((f) => f.endsWith('.pdf'))
      .map((f) => {
        const filePath = path.join(outputDir, f);
        const stats = fs.statSync(filePath);
        return {
          fileName: f,
          filePath,
          fileSize: stats.size,
          createdAt: stats.birthtime,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      count: pdfFiles.length,
      pdfs: pdfFiles,
    };
  } catch (error: any) {
    logger.error({ error: error.message }, 'Error listing PDFs');
    return {
      count: 0,
      pdfs: [],
    };
  }
}

/**
 * Delete a generated PDF
 */
export function deletePDF(fileName: string): { success: boolean; message: string } {
  logger.info({ fileName }, 'Deleting PDF');

  try {
    const outputDir = getOutputDirectory();
    const filePath = path.join(outputDir, fileName);

    // Security: ensure file is in output directory
    if (!filePath.startsWith(outputDir)) {
      return {
        success: false,
        message: '❌ Invalid file path',
      };
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info({ fileName }, 'PDF deleted successfully');
      return {
        success: true,
        message: `✅ PDF deleted: ${fileName}`,
      };
    } else {
      return {
        success: false,
        message: `❌ PDF not found: ${fileName}`,
      };
    }
  } catch (error: any) {
    logger.error({ error: error.message, fileName }, 'Error deleting PDF');
    return {
      success: false,
      message: `❌ Error deleting PDF: ${error.message}`,
    };
  }
}

/**
 * Skill exports for agent registration
 */
export const generateTextPDFSkill = {
  name: 'generate_text_pdf',
  description: 'Generate a PDF document from plain text content',
  execute: async (params: {
    content: string;
    title?: string;
    author?: string;
    fontSize?: number;
  }) => {
    return await generateTextPDF(params.content, {
      title: params.title,
      author: params.author,
      fontSize: params.fontSize,
    });
  },
};

export const generateHTMLPDFSkill = {
  name: 'generate_html_pdf',
  description: 'Generate a PDF document from HTML content',
  execute: async (params: {
    htmlContent: string;
    title?: string;
    author?: string;
    fontSize?: number;
  }) => {
    return await generateHTMLPDF(params.htmlContent, {
      title: params.title,
      author: params.author,
      fontSize: params.fontSize,
    });
  },
};

export const generateWebPagePDFSkill = {
  name: 'generate_webpage_pdf',
  description: 'Generate a PDF document from web page content',
  execute: async (params: {
    pageTitle: string;
    pageUrl: string;
    pageContent: string;
    author?: string;
  }) => {
    return await generateWebPagePDF(params.pageTitle, params.pageUrl, params.pageContent, {
      author: params.author,
    });
  },
};

export const generateReportPDFSkill = {
  name: 'generate_report_pdf',
  description: 'Generate a structured report PDF from sections and data',
  execute: async (params: {
    reportTitle: string;
    sections: Array<{ heading: string; content: string }>;
    summary?: string;
  }) => {
    return await generateReportPDF(params.reportTitle, {
      sections: params.sections,
      summary: params.summary,
    });
  },
};

export const listPDFsSkill = {
  name: 'list_pdfs',
  description: 'List all generated PDF documents',
  execute: async () => {
    return listGeneratedPDFs();
  },
};

export const deletePDFSkill = {
  name: 'delete_pdf',
  description: 'Delete a generated PDF document',
  execute: async (params: { fileName: string }) => {
    return deletePDF(params.fileName);
  },
};
