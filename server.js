require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { WebClient } = require('@slack/web-api');
const { createMessageAdapter } = require('@slack/interactive-messages');

const app = express();
const port = process.env.PORT || 3000;

const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const token = process.env.SLACK_BOT_TOKEN;

const slackInteractions = createMessageAdapter(slackSigningSecret);
const slackClient = new WebClient(token);

app.use('/slack/actions', slackInteractions.expressMiddleware());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


app.post('/slack/events', (req, res) => {
    if (req.body.type === 'url_verification') {
        res.send({ challenge: req.body.challenge });
    } else {
        res.status(400).send('Invalid request');
    }
});

app.post('/slack/commands', async (req, res) => {
    const { trigger_id } = req.body;

    const view = {
        type: 'modal',
        callback_id: 'approval_modal',
        title: {
            type: 'plain_text',
            text: 'Request Approval'
        },
        blocks: [
            {
                type: 'input',
                block_id: 'approver_block',
                element: {
                    type: 'users_select',
                    action_id: 'approver',
                    placeholder: {
                        type: 'plain_text',
                        text: 'Select an approver'
                    }
                },
                label: {
                    type: 'plain_text',
                    text: 'Approver'
                }
            },
            {
                type: 'input',
                block_id: 'text_block',
                element: {
                    type: 'plain_text_input',
                    action_id: 'approval_text',
                    multiline: true,
                    placeholder: {
                        type: 'plain_text',
                        text: 'Enter your request for approval'
                    }
                },
                label: {
                    type: 'plain_text',
                    text: 'Approval Text'
                }
            }
        ],
        submit: {
            type: 'plain_text',
            text: 'Submit'
        }
    };

    await slackClient.views.open({
        trigger_id,
        view
    });

    res.send('');
});

app.get('/slack/commands', (req, res) => {
    res.status(200).send('OK');
});

slackInteractions.viewSubmission('approval_modal', async (payload) => {
    const approver = payload.view.state.values.approver_block.approver.selected_user;
    const approvalText = payload.view.state.values.text_block.approval_text.value;
    const requester = payload.user.id;

    await slackClient.chat.postMessage({
        channel: approver,
        text: `You have a new approval request from <@${requester}>: ${approvalText}`,
        attachments: [
            {
                text: 'Do you approve?',
                fallback: 'You are unable to approve/reject the request',
                callback_id: 'approval_request',
                color: '#3AA3E3',
                attachment_type: 'default',
                actions: [
                    {
                        name: 'approve',
                        text: 'Approve',
                        type: 'button',
                        value: 'approve'
                    },
                    {
                        name: 'reject',
                        text: 'Reject',
                        type: 'button',
                        value: 'reject'
                    }
                ]
            }
        ]
    });

    return { response_action: 'clear' };
});

slackInteractions.action('approval_request', async (payload, respond) => {
    const action = payload.actions[0];
    const requester = payload.original_message.text.match(/<@(.*?)>/)[1];
    const approver = payload.user.id;

    let responseText;
    if (action.value === 'approve') {
        responseText = `<@${approver}> has approved the request from <@${requester}>.`;
    } else {
        responseText = `<@${approver}> has rejected the request from <@${requester}>.`;
    }

    await slackClient.chat.postMessage({
        channel: requester,
        text: responseText
    });

    respond({ text: responseText, replace_original: true });
});

app.listen(port, () => {
    console.log(`Slack bot is running on port ${port}`);
});
