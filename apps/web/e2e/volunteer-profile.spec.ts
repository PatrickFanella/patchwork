import { expect, test } from '@playwright/test';

const volunteerUri =
    'at://did:plc:volunteer-owner/app.patchwork.volunteer.profile/self';

test('volunteer publishes, updates, discovers, and deletes a privacy-safe profile', async ({
    page,
    baseURL,
}) => {
    if (!baseURL) throw new Error('Playwright baseURL is required.');
    await page.context().addCookies([
        {
            name: 'patchwork_csrf',
            value: 'volunteer-csrf',
            url: baseURL,
        },
    ]);

    let profile:
        | {
              uri: string;
              cid: string;
              record: Record<string, unknown>;
              privateProfile: Record<string, unknown>;
          }
        | undefined;
    const commandBodies: Array<Record<string, unknown>> = [];

    await page.route('**/api/**', async route => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname.replace(/^\/api/, '');
        if (pathname === '/auth/session') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    session: {
                        did: 'did:plc:volunteer-owner',
                        handle: 'helper.test',
                        expiresAt: '2099-01-01T00:00:00.000Z',
                    },
                }),
            });
            return;
        }
        if (pathname === '/account/onboarding') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    policyVersion: '2026-07-28',
                    requiredDocuments: ['terms', 'privacy', 'community-guidelines'],
                    consentRequired: false,
                    acceptedAt: '2026-07-28T12:00:00.000Z',
                }),
            });
            return;
        }
        if (pathname === '/query/volunteers') {
            const results =
                profile ?
                    [
                        {
                            uri: profile.uri,
                            cid: profile.cid,
                            authorDid: 'did:plc:volunteer-owner',
                            displayName: profile.record['displayName'],
                            bio: profile.record['bio'],
                            capabilities: profile.record['capabilities'],
                            availability: profile.record['availability'],
                            contactPreference:
                                profile.record['contactPreference'],
                            skills: profile.record['skills'],
                            languages: profile.record['languages'],
                            serviceArea: {
                                areaLabel: 'North side',
                                noPermanentAddress: true,
                                approximateGeo: {
                                    latitude: 41.92,
                                    longitude: -87.68,
                                    precisionKm: 2,
                                },
                            },
                            updatedAt: profile.record['updatedAt'],
                        },
                    ]
                :   [];
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    total: results.length,
                    page: 1,
                    pageSize: 100,
                    hasNextPage: false,
                    results,
                }),
            });
            return;
        }
        if (pathname === '/at/volunteer-profile') {
            if (request.method() === 'GET') {
                await route.fulfill({
                    status: profile ? 200 : 404,
                    contentType: 'application/json',
                    body: JSON.stringify(
                        profile ?? {
                            error: {
                                code: 'NOT_FOUND',
                                message: 'Profile not found.',
                            },
                        },
                    ),
                });
                return;
            }
            if (request.method() === 'DELETE') {
                commandBodies.push(
                    request.postDataJSON() as Record<string, unknown>,
                );
                profile = undefined;
                await route.fulfill({ status: 204, body: '' });
                return;
            }
            const body = request.postDataJSON() as Record<string, unknown>;
            commandBodies.push(body);
            const now = '2026-07-28T12:00:00.000Z';
            const input = body['profile'] as Record<string, unknown>;
            profile = {
                uri: volunteerUri,
                cid:
                    request.method() === 'POST' ?
                        'bafy-volunteer-created'
                    :   'bafy-volunteer-updated',
                record: {
                    $type: 'app.patchwork.volunteer.profile',
                    version: '1.2.0',
                    ...input,
                    createdAt: now,
                    updatedAt: now,
                },
                privateProfile: body['privateProfile'] as Record<
                    string,
                    unknown
                >,
            };
            await route.fulfill({
                status: request.method() === 'POST' ? 201 : 200,
                contentType: 'application/json',
                body: JSON.stringify(profile),
            });
            return;
        }
        await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
                error: { code: 'NOT_FOUND', message: 'Not found.' },
            }),
        });
    });

    await page.goto('/volunteer');
    await expect(
        page.getByRole('region', { name: 'Create my profile' }),
    ).toBeVisible();
    await page.getByLabel('Display name').fill('Alex Helper');
    await page
        .getByLabel('Public bio')
        .fill('Neighborhood delivery and route-planning support.');
    await page.getByLabel('Food Delivery').check();
    await page.getByLabel('Public skills').fill('route planning, meal delivery');
    await page.getByLabel('Public languages').fill('en, es');
    await page.getByLabel('Approximate service-area label').fill('North side');
    await page.getByLabel('Approximate latitude').fill('41.92');
    await page.getByLabel('Approximate longitude').fill('-87.68');
    await page.getByLabel('I do not have a permanent address').check();
    await page
        .getByLabel('Private contact email')
        .fill('private-helper@example.test');
    await page
        .getByLabel('Private availability windows')
        .fill('weekday evenings');
    await page.getByRole('button', { name: 'Publish profile' }).click();

    await expect(page.getByText('Volunteer profile published.')).toBeVisible();
    await expect(page.getByText('Alex Helper')).toBeVisible();
    await expect(page.getByText('private-helper@example.test')).toHaveCount(0);
    await expect(page.getByText('weekday evenings')).toHaveCount(0);

    await page.getByLabel('Public bio').fill('Updated public volunteer bio.');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Volunteer profile updated.')).toBeVisible();
    await expect(
        page
            .getByRole('article', { name: 'Alex Helper' })
            .getByText('Updated public volunteer bio.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Delete profile' }).click();
    await expect(page.getByText('Volunteer profile deleted.')).toBeVisible();
    await expect(
        page.getByRole('region', { name: 'Create my profile' }),
    ).toBeVisible();

    expect(commandBodies).toHaveLength(3);
    const publicPayload = commandBodies[0]?.['profile'] as Record<
        string,
        unknown
    >;
    expect(publicPayload).not.toHaveProperty('did');
    expect(publicPayload).not.toHaveProperty('verificationCheckpoints');
    expect(JSON.stringify(publicPayload)).not.toContain(
        'private-helper@example.test',
    );
});
