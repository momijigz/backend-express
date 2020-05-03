const fs = require('fs').promises;
const path = require('path');
const sgMail = require('@sendgrid/mail');
const mjml2html = require('mjml');
const Mustache = require('mustache');

sgMail.setApiKey(process.env.SG_API_KEY);

const mjmlOptions = {};

const sendEmail = async (templateName, options) => {
  const mjmlTemplateFile = await fs.readFile(path.join(__dirname, `../templates/${templateName}/content.hjs`), 'utf-8');
  const subjectTemplateFile = await fs.readFile(path.join(__dirname, `../templates/${templateName}/subject.hjs`), 'utf-8');

  if (!options || !options.recipient || !options.data) {
    throw new Error('recipient and data required');
  }
  
  const mjmlContent = Mustache.render(mjmlTemplateFile, {
    ...(Object.assign({ recipient: options.recipient }, options.data))
  });

  const subject = Mustache.render(subjectTemplateFile, {
    ...(Object.assign({ recipient: options.recipient }, options.data))
  });

  const mjmlParseResults = mjml2html(mjmlContent, mjmlOptions);

  const msg = {
    to: options.recipient.email,
    from: 'The Giving Tree <noreply@givingtreeproject.org>',
    subject,
    html: mjmlParseResults.html,
  };

  const sgResult = await sgMail.send(msg);

  return {
    msg,
    sgResult,
  };
};

module.exports = {
  sendEmail,
  mjmlOptions,
};
