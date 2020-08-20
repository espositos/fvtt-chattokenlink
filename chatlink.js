export class ChatLink {
    static clickTimeout = 250;
    static clickCount = 0;
    static clickTimer = null;
    static playerWarning = (data) => ChatLink.i18nFormat('tokenchatlink.notInSight', data);

    static showTooltip = true;
    static hoverTimeout = 1000;
    static hoverTimer = null;

    static i18n = (toTranslate) => game.i18n.localize(toTranslate);
    static i18nFormat = (toTranslate, data) => game.i18n.format(toTranslate, data);

    static init() {
        ChatLink.updateSettings();
    }

    static updateSettings() {
        ChatLink.showTooltip = game.settings.get('token-chat-link', 'hoverTooltip');
    }
    
    static prepareEvent(message, html, speakerInfo) {
        let clickable = html.find('.message-sender');

        let speaker = speakerInfo.message.speaker;
        if (!(speaker.actor || speaker.token))
            return;

        ChatLink.formatLink(clickable);
        let speakerName = clickable[0].textContent ?? speaker.alias ?? ChatLink.i18n('tokenchatlink.genericName');
        let speakerData = { idScene: speaker.scene, idActor:speaker.actor, idToken: speaker.token, name: speakerName }

        if (!speakerData.idScene)
            speakerData.idScene = speakerInfo.author.viewedScene;

        function clicks(e, speakerData) {
            ChatLink.clickCount++;
            if (ChatLink.clickCount == 1) {
                ChatLink.clickTimer = setTimeout(() => {
                    ChatLink.clickCount = 0;
                    ChatLink.selectToken(e, speakerData);
                }, ChatLink.clickTimeout);
            } else {
                ChatLink.clickCount = 0;
                clearTimeout(ChatLink.clickTimer);
                ChatLink.panToToken(e, speakerData);
            }
        }

        clickable.on('click', (e) => {
            clicks(e, speakerData)
        }).on('dblclick', (e) => {
            e.preventDefault();
        });
    }


    // If it's reached this far, assume scene is correct.
    static panToToken(event, speakerData) {
        let user = game.user;
        
        let token = ChatLink.getToken(speakerData);
        if (!ChatLink.tokenExists(user, speakerData, token))
            return;

        if (!ChatLink.permissionToSee(user, speakerData, token))
            return;

        ChatLink.doPanToToken(event, user, token);
    }

    static selectToken(event, speakerData) {
        let user = game.user;

        let token = ChatLink.getToken(speakerData);
        if (!ChatLink.tokenExists(user, speakerData, token))
            return;

        if (!ChatLink.permissionToSee(user, speakerData, token))
            return;

        ChatLink.doSelectToken(event, user, token);
    }

    static getToken(speakerData) {
        let token = canvas.tokens.placeables.find(t => t.id === speakerData.idToken);
        if(!token)
            token = canvas.tokens.placeables.find(t => t.actor?._id === speakerData.idActor);

        return token;
    }

    static tokenExists(user, speakerData, token) {
        if (token && token.visible)
            return true;
        
        if (!ChatLink.isRightScene(user, speakerData))
            return;

        let message = user.isGM ? ChatLink.playerWarning(speakerData) + ` ${ChatLink.i18n('tokenchatlink.noTokenFound')}` : ChatLink.playerWarning(speakerData);
        ChatLink.warning(message);
    }

    static isRightScene(user, speakerData) {
        if (canvas.scene._id === speakerData.idScene)
            return true;

        let sceneNote;
        if (!speakerData.idScene) {
            sceneNote = ` ${ChatLink.i18n('tokenchatlink.noSceneFound')}`;
        } else {
            let tokenScene = game.scenes.find(s => s.data._id === speakerData.idScene);
            sceneNote = ` ${ChatLink.i18nFormat('tokenchatlink.checkScene', {sceneName: tokenScene?.data.name})}`;
        }

        let message = user.isGM ? ChatLink.playerWarning(speakerData) + sceneNote : ChatLink.playerWarning(speakerData);
        ChatLink.warning(message);
    }

    static permissionToSee(user, speakerData, token) {
        if (user.isGM || token.visible)
            return true;
        
        ChatLink.warning(ChatLink.playerWarning(speakerData));
    }

    static permissionToControl(user, token) {
        return user.isGM || token.actor.hasPerm(user, "OWNER");
    }

    static doSelectToken(event, user, token) {
        let ctrlKey = event.ctrlKey;
        if (!ChatLink.permissionToControl(user, token)) {      
            ChatLink.targetToken(event, user, token, ctrlKey);
            return;
        }

        let shiftKey = event.shiftKey;

        if (shiftKey) {
            ChatLink.targetToken(event, user, token, ctrlKey);
        } else {
            ChatLink.controlToken(event, user, token, ctrlKey);
        }
    }

    static doPanToToken(event, user, token) {
        let scale = canvas.scene._viewPosition.scale;

        canvas.animatePan({x: token.x, y: token.y, scale: scale, duration: 500});
    }

    static controlToken(event, user, token, ctrlKey) {
        let releaseOthers = {releaseOthers: !ctrlKey};
        if (ctrlKey) {
            if (token._controlled)
                token.release();
            else
                token.control(releaseOthers);

            return;
        }

        if (token._controlled || canvas.tokens.controlled.length !== 1)
            token.control(releaseOthers);
        else if (!token._controlled && canvas.tokens.controlled.length === 1)
            token.control(releaseOthers);
        else
            token.release();
    }

    static targetToken(event, user, token, ctrlKey) {
        let releaseOthers = {releaseOthers: !ctrlKey};
        if (ctrlKey) {
            if (token.isTargeted)
                token.setTarget(false, releaseOthers);
            else
                token.setTarget(true, releaseOthers);

            return;
        }

        if (token.isTargeted || game.user.targets.size !== 1)
            token.setTarget(true, releaseOthers);
        else if (!token.isTargeted && game.user.targets.size === 1)
            token.setTarget(true, releaseOthers);
        else
            token.setTarget(false, releaseOthers);
    }

    static getCoords(token) {
        let result = { x: token.center.x, y: token.center.y, width: 1, height: 1 }
        return result;
    }
    
    static warning(message) {
        ui.notifications.warn(message);
    }

    static formatLink(html) {
        html.hover(() => {
            html.addClass('tokenChatLink')
            
            if (ChatLink.showTooltip) {
                ChatLink.hoverTimer = setTimeout(() => {
                    // add tooltip
                    let tooltip = document.createElement("SPAN");
                    tooltip.classList.add('tokenChatLink-tooltip');
                    let content = TooltipHelper.getContent();
                    tooltip.innerHTML = content;
                    html.append(tooltip)
    
                    // adjust position of tooltip
                    tooltip = $(document).find('.tokenChatLink-tooltip');
                    let htmlRect = html[0].getBoundingClientRect();
                    let tooltipRect = tooltip[0].getBoundingClientRect();
                    tooltip.css('top', htmlRect.y - tooltipRect.height - 10).css('left', 15);
                }, ChatLink.hoverTimeout);
            }
        }, 
        () => {
            clearTimeout(ChatLink.hoverTimer);
            html.removeClass('tokenChatLink')
            let tooltip = $(document).find('.tokenChatLink-tooltip');
            tooltip.remove();
        });
    }
}

export class TooltipHelper {
    static getContent() {
        let tips = game.user.isGM ? TooltipHelper.gmTips() : TooltipHelper.playerTips();

        let tooltipData = {
            title: game.i18n.localize("tokenchatlink.instructionsTitle"),
            tips: tips
        }
        
        let template = Handlebars.compile('{{> modules/token-chat-link/templates/instructions.hbs}}');
        let content = template(tooltipData);

        return content;
    }

    static gmTips() {
        return [
            game.i18n.localize("tokenchatlink.gmClick"),
            game.i18n.localize("tokenchatlink.shiftClick"),
            game.i18n.localize("tokenchatlink.doubleClick"),
            game.i18n.localize("tokenchatlink.gmCtrlClick"),
            game.i18n.localize("tokenchatlink.gmCtrlShiftClick")
        ]
    }

    static playerTips() {
        return [
            game.i18n.localize("tokenchatlink.playerClick"),
            game.i18n.localize("tokenchatlink.shiftClick"),
            game.i18n.localize("tokenchatlink.doubleClick"),
            game.i18n.localize("tokenchatlink.playerCtrlClick"),
            game.i18n.localize("tokenchatlink.playerCtrlShiftClick")
        ]
    }
}