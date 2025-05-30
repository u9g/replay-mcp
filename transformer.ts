// import fs from "fs";
import * as T from "@rrweb/types";
import type { CustomEvent } from "/Users/jasonlernerman/code/todo-app-vite/src/rrweb.tsx"

// const replay = JSON.parse(fs.readFileSync("./saved_recordings/recording.json", "utf8")) as T.eventWithTime[];


export function transform(replay: T.eventWithTime[]) {
    let output: string[] = []

    for (const event of replay) {
        if (event.type === T.EventType.IncrementalSnapshot) {
            if (event.data.source === T.IncrementalSource.MouseInteraction) {
                if (event.data.type === T.MouseInteractions.MouseUp) {
                    output.push(`User released the mouse button.`);
                } else if (event.data.type === T.MouseInteractions.MouseDown) {
                    output.push(`User pressed the mouse button.`);
                } else if (event.data.type === T.MouseInteractions.Click) {
                    output.push(`User clicked the mouse button.`);
                } else if (event.data.type === T.MouseInteractions.ContextMenu) {
                    output.push(`User right-clicked the mouse button.`);
                } else if (event.data.type === T.MouseInteractions.DblClick) {
                    output.push(`User double-clicked the mouse button.`);
                } else if (event.data.type === T.MouseInteractions.TouchStart) {
                    output.push(`User touched the screen.`);
                } else if (event.data.type === T.MouseInteractions.TouchEnd) {
                    output.push(`User lifted their finger from the screen.`);
                }
            }
        } else if (event.type === T.EventType.Custom) {
            const pkt = { data: event.data.payload, name: event.data.tag } as CustomEvent;
            if (pkt.name === 'clicked-node-not-found') {
                output.push(`User clicked on a node that does not exist.`);
            } else if (pkt.name === 'clicked-without-clicking-on-any-react-component') {
                output.push(`User clicked on a dom node with no corresponding React component.`);
            } else if (pkt.name === 'no-view-change-after-click') {
                output.push(`No view change after click on the component (${pkt.data.componentStack.map(x => x ?? "?unknown component?").join(" > ")}).`);
            } else if (pkt.name === 'rage-click') {
                output.push(`User clicked repeatedly in a short period of time, and their last click was on the react component (${pkt.data.componentStack.map(x => x ?? "?unknown component?").join(" > ")}). First, decide if this was a bug. If not, think of ways to make it so they don't have to click this much and offer them to the user in the form of three options labeled a, b, and c. Then ask the user which task to continue forward with.`);
            } else if (pkt.name === 'rage-click-with-no-react-fiber') {
                output.push(`User clicked repeatedly in a short period of time, on a node with no corresponding React fiber.`);
            } else if (pkt.name === 'dom-mutation') {
                output.push(`Dom mutation performed.`);
            } else if (pkt.name === 'media-load-error') {
                output.push(`Media load error on url: \`${pkt.data.url}\`. (In component: ${pkt.data.componentStack.map(x => x ?? "?unknown component?").join(" > ")}).`);
            }
        }
    }
    return output.join("\n");
}

// console.log(output);
