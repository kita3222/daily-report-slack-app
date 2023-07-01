import { App, AwsLambdaReceiver, Block } from "@slack/bolt";
import { LinearClient } from "@linear/sdk";
import { WebClient } from "@slack/web-api";

const linearClient = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY ?? "",
});

const slackClient = new WebClient(process.env.SLACK_AUTH_TOKEN ?? "");

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
});

// ボットトークンを使ってアプリを初期化します
const app = new App({
  token: process.env.SLACK_AUTH_TOKEN,
  receiver: awsLambdaReceiver,
});

app.shortcut("daily_report_in", async ({ ack, body, client }) => {
  await ack();

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        callback_id: "daily_report_in_id",
        title: {
          type: "plain_text",
          text: "出勤",
          emoji: true,
        },
        type: "modal",
        close: {
          type: "plain_text",
          text: "キャンセル",
          emoji: true,
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "出勤するアカウントを選択してください。",
            },
            accessory: {
              type: "users_select",
              placeholder: {
                type: "plain_text",
                text: "アカウントを選択",
                emoji: true,
              },
              action_id: "users_select-action",
            },
          },
        ],
      },
    });
  } catch (err) {
    console.error(err);
  }
});

app.action("users_select-action", async ({ ack, body, client }) => {
  await ack();

  const slackUserResponse = await slackClient.users.profile.get({
    user: body.user.id,
  });

  const assignedIssues = await linearClient.issues({
    filter: {
      assignee: {
        email: {
          eq: slackUserResponse?.profile?.email,
        },
      },
      state: {
        type: {
          in: ["unstarted", "started"],
        },
      },
    },
  });

  const options = assignedIssues.nodes.map((issue) => {
    return {
      text: {
        type: "plain_text" as "plain_text",
        text: issue.title,
        emoji: false,
      },
      value: issue.url,
    };
  });

  // 実態と異なる方定義のため、anyで回避
  const _body = body as any;

  try {
    await client.views.update({
      view_id: _body.container.view_id,
      view: {
        callback_id: "daily_report_in_id",
        type: "modal",
        submit: {
          type: "plain_text",
          text: "送信",
          emoji: true,
        },
        close: {
          type: "plain_text",
          text: "キャンセル",
          emoji: true,
        },
        title: {
          type: "plain_text",
          text: "出勤",
          emoji: true,
        },
        blocks: [
          {
            type: "divider",
          },
          {
            type: "input",
            block_id: "linear_input_id",
            label: {
              type: "plain_text",
              text: "今日やることをlinearから選択",
              emoji: true,
            },
            element: {
              type: "multi_static_select",
              placeholder: {
                type: "plain_text",
                text: "issueを選択",
                emoji: true,
              },
              options: options,
              action_id: "multi_static_select-action",
            },
            optional: true,
          },
          {
            type: "input",
            block_id: "todo_input_id",
            label: {
              type: "plain_text",
              text: "その他今日やることを入力",
              emoji: true,
            },
            element: {
              type: "plain_text_input",
              multiline: true,
              action_id: "plain_text_input-action",
            },
            optional: true,
          },
          {
            type: "input",
            block_id: "contact_input_id",
            label: {
              type: "plain_text",
              text: "連絡事項",
              emoji: true,
            },
            element: {
              type: "plain_text_input",
              action_id: "plain_text_input-action",
              multiline: true,
            },
            optional: true,
          },
        ],
      },
    });
  } catch (err) {
    console.error(err);
  }
});

app.view("daily_report_in_id", async ({ ack, body, view, client }) => {
  await ack();

  const todoInputs = view["state"]["values"]["linear_input_id"][
    "multi_static_select-action"
  ]["selected_options"]?.map((item) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `●  ${item.text.text}`,
    },
    accessory: {
      type: "button",
      action_id: "button-action",
      text: {
        type: "plain_text",
        text: "Go to issue",
        emoji: true,
      },
      value: "to_link",
      url: item.value,
    },
  })) as Block[];

  const todoTextInput =
    view["state"]["values"]["todo_input_id"]["plain_text_input-action"][
      "value"
    ] ?? "";

  const contactTextInput =
    view["state"]["values"]["contact_input_id"]["plain_text_input-action"][
      "value"
    ] ?? "";

  try {
    await client.chat.postMessage({
      channel: "#sandbox",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: ":newspaper:  出勤  :newspaper:",
          },
        },
        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<@${body["user"]["id"]}>`,
          },
        },
        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: ":calendar: |   *今日やること*  | :calendar: ",
          },
        },
        ...todoInputs,
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `●  ${todoTextInput}`,
          },
        },
        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: " :loud_sound: *連絡事項* :loud_sound:",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: contactTextInput,
            verbatim: false,
          },
        },
      ],
    });
  } catch (err) {
    console.error(err);
  }
});

app.action("button-action", async ({ ack }) => {
  ack();
  return;
});

app.shortcut("daily_report_out", async ({ ack, body, client }) => {
  await ack();

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        submit: {
          type: "plain_text",
          text: "送信",
          emoji: true,
        },
        close: {
          type: "plain_text",
          text: "キャンセル",
          emoji: true,
        },
        title: {
          type: "plain_text",
          text: "退勤",
          emoji: true,
        },
        blocks: [
          {
            type: "divider",
          },
          {
            type: "input",
            label: {
              type: "plain_text",
              text: "今日やったことをlinearから選択",
              emoji: true,
            },
            element: {
              type: "multi_static_select",
              placeholder: {
                type: "plain_text",
                text: "issueを選択",
                emoji: true,
              },
              options: [
                {
                  text: {
                    type: "plain_text",
                    text: ":pizza: Pizza",
                    emoji: true,
                  },
                  value: "value-0",
                },
                {
                  text: {
                    type: "plain_text",
                    text: ":fried_shrimp: Thai food",
                    emoji: true,
                  },
                  value: "value-1",
                },
                {
                  text: {
                    type: "plain_text",
                    text: ":desert_island: Hawaiian",
                    emoji: true,
                  },
                  value: "value-2",
                },
                {
                  text: {
                    type: "plain_text",
                    text: ":meat_on_bone: Texas BBQ",
                    emoji: true,
                  },
                  value: "value-3",
                },
                {
                  text: {
                    type: "plain_text",
                    text: ":hamburger: Burger",
                    emoji: true,
                  },
                  value: "value-4",
                },
                {
                  text: {
                    type: "plain_text",
                    text: ":taco: Tacos",
                    emoji: true,
                  },
                  value: "value-5",
                },
                {
                  text: {
                    type: "plain_text",
                    text: ":green_salad: Salad",
                    emoji: true,
                  },
                  value: "value-6",
                },
                {
                  text: {
                    type: "plain_text",
                    text: ":stew: Indian",
                    emoji: true,
                  },
                  value: "value-7",
                },
              ],
            },
          },
          {
            type: "input",
            label: {
              type: "plain_text",
              text: "その他今日やったことを入力",
              emoji: true,
            },
            element: {
              type: "plain_text_input",
              multiline: true,
            },
            optional: true,
          },
          {
            type: "input",
            label: {
              type: "plain_text",
              text: "連絡事項",
              emoji: true,
            },
            element: {
              type: "plain_text_input",
              multiline: true,
            },
            optional: true,
          },
        ],
      },
    });
  } catch (err) {
    console.error(err);
  }
});

export async function DailyReportAppHandler(
  event: any,
  context: any,
  callback: any
) {
  const handler = await awsLambdaReceiver.start();
  return handler(event, context, callback);
}