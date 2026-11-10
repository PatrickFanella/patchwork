-- Offers (#135): a response to an offer is an "ask". Email, push and the
-- notification centre now word asks as asks, using request_workflows.post_type.
-- The function also notifies a responder whose pending offer or ask closed
-- because the poster accepted someone else or closed a pickup. Notification
-- types are unchanged, so preferences and the type CHECK constraint stay valid.
-- Rollback: re-run the notify_coordination_offer_event definition from 0020.
CREATE OR REPLACE FUNCTION notify_coordination_offer_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    offer coordination_offers%ROWTYPE;
    is_offer BOOLEAN;
    recipient TEXT;
    kind TEXT;
    heading TEXT;
    summary TEXT;
BEGIN
    SELECT * INTO offer
      FROM coordination_offers
     WHERE offer_id = NEW.offer_id;
    SELECT COALESCE(bool_or(post_type = 'offer'), FALSE) INTO is_offer
      FROM request_workflows
     WHERE post_uri = offer.request_uri;
    IF NEW.action = 'offered' THEN
        recipient := offer.requester_did;
        kind := 'offer_received';
        heading := CASE WHEN is_offer THEN 'Someone asked for your offer' ELSE 'New offer' END;
        summary := CASE WHEN is_offer
            THEN 'A neighbor asked for what you offered. Their identity stays private until you accept.'
            ELSE 'Someone offered to help with your request.' END;
    ELSIF NEW.action = 'accepted' THEN
        PERFORM patchwork_enqueue_notification(
            offer.requester_did, 'connection_started',
            'Connection started',
            'Your mutual-aid connection is ready for coordination.',
            'normal', '/inbox',
            jsonb_build_object('offerId', NEW.offer_id),
            'coordination-event:' || NEW.event_id::text || ':connection',
            NEW.occurred_at
        );
        recipient := offer.offerer_did;
        kind := 'offer_accepted';
        heading := CASE WHEN is_offer THEN 'Ask accepted' ELSE 'Offer accepted' END;
        summary := CASE WHEN is_offer
            THEN 'Your ask was accepted. Open coordination for next steps.'
            ELSE 'Your offer was accepted. Open coordination for next steps.' END;
    ELSIF NEW.action = 'declined' THEN
        recipient := offer.offerer_did;
        kind := 'offer_declined';
        heading := CASE WHEN is_offer THEN 'Ask declined' ELSE 'Offer declined' END;
        summary := CASE WHEN is_offer THEN 'Your ask was declined.' ELSE 'Your offer was declined.' END;
    ELSIF NEW.action = 'cancelled'
        AND (NEW.actor_did IS NULL OR NEW.actor_did = offer.requester_did) THEN
        -- Closed by the poster's choice (another responder accepted, or the
        -- pickup closed). A responder withdrawing their own offer is not sent.
        recipient := offer.offerer_did;
        kind := 'offer_declined';
        heading := CASE WHEN is_offer THEN 'Ask closed' ELSE 'Offer closed' END;
        summary := CASE WHEN is_offer
            THEN 'The poster accepted someone else for this offer.'
            ELSE 'This request no longer needs your offer.' END;
    ELSIF NEW.action = 'expired' THEN
        recipient := offer.offerer_did;
        kind := 'offer_expired';
        heading := CASE WHEN is_offer THEN 'Ask expired' ELSE 'Offer expired' END;
        summary := CASE WHEN is_offer
            THEN 'Your ask expired before it was accepted.'
            ELSE 'Your offer expired before it was accepted.' END;
    ELSIF NEW.action = 'connection-completed' THEN
        recipient := CASE
            WHEN NEW.actor_did = offer.requester_did
                THEN offer.offerer_did
            ELSE offer.requester_did
        END;
        kind := 'connection_completed';
        heading := 'Handoff completed';
        summary := 'The mutual-aid handoff was marked complete.';
    ELSIF NEW.action IN ('connection-cancelled', 'connection-expired') THEN
        recipient := CASE
            WHEN NEW.actor_did = offer.requester_did
                THEN offer.offerer_did
            ELSE offer.requester_did
        END;
        kind := 'connection_cancelled';
        heading := 'Connection closed';
        summary := 'The mutual-aid connection is no longer active.';
    ELSE
        RETURN NEW;
    END IF;
    PERFORM patchwork_enqueue_notification(
        recipient, kind, heading, summary, 'normal', '/inbox',
        jsonb_build_object('offerId', NEW.offer_id),
        'coordination-event:' || NEW.event_id::text, NEW.occurred_at
    );
    RETURN NEW;
END;
$$;
