import { useEffect, useMemo, useState } from 'react';

import { c } from 'ttag';

import { Button } from '@proton/atoms/Button';
import { joinHolidaysCalendar, removeMember } from '@proton/shared/lib/api/calendars';
import { dedupeNotifications } from '@proton/shared/lib/calendar/alarms';
import { modelToNotifications } from '@proton/shared/lib/calendar/alarms/modelToNotifications';
import { notificationsToModel } from '@proton/shared/lib/calendar/alarms/notificationsToModel';
import { updateCalendar } from '@proton/shared/lib/calendar/calendar';
import { MAX_DEFAULT_NOTIFICATIONS } from '@proton/shared/lib/calendar/constants';
import {
    findHolidaysCalendarByCountryCodeAndLanguageCode,
    getDefaultHolidaysCalendar,
    getHolidaysCalendarsFromCountryCode,
    getJoinHolidaysCalendarData,
} from '@proton/shared/lib/calendar/holidaysCalendar/holidaysCalendar';
import { getRandomAccentColor } from '@proton/shared/lib/colors';
import { languageCode } from '@proton/shared/lib/i18n';
import {
    CalendarCreateData,
    CalendarSettings,
    HolidaysDirectoryCalendar,
    NotificationModel,
    VisualCalendar,
} from '@proton/shared/lib/interfaces/calendar';
import noop from '@proton/utils/noop';
import uniqueBy from '@proton/utils/uniqueBy';

import {
    ColorPicker,
    Form,
    InputFieldTwo,
    Loader,
    ModalTwo as Modal,
    ModalTwoContent as ModalContent,
    ModalTwoFooter as ModalFooter,
    ModalTwoHeader as ModalHeader,
    ModalProps,
    Option,
    SelectTwo,
    useFormErrors,
} from '../../../components';
import CountrySelect from '../../../components/country/CountrySelect';
import {
    useAddresses,
    useApi,
    useCalendarUserSettings,
    useEventManager,
    useGetAddressKeys,
    useGetAddresses,
    useGetCalendarBootstrap,
    useLoading,
    useNotifications,
    useReadCalendarBootstrap,
} from '../../../hooks';
import { getDefaultModel } from '../calendarModal/calendarModalState';
import Notifications from '../notifications/Notifications';

const getInitialCalendar = (
    inputCalendar: HolidaysDirectoryCalendar | undefined,
    defaultCalendar: HolidaysDirectoryCalendar | undefined,
    canPreselect: boolean
) => {
    // If we have an input holiday calendar set, we want to edit it.
    // The initial selected option needs to be this one so that we can fill all modal inputs
    if (inputCalendar) {
        return inputCalendar;
    }

    // Else we return the default calendar (calendar found based on the user timezone) if one is found and hasn't been already subscribed by the user
    return canPreselect ? defaultCalendar : undefined;
};

const getHasAlreadyJoinedCalendar = (
    holidaysCalendars: VisualCalendar[],
    calendar?: HolidaysDirectoryCalendar,
    inputCalendar?: VisualCalendar
) => {
    if (!calendar) {
        return false;
    }
    const { CalendarID } = calendar;
    const holidaysCalendar = holidaysCalendars.find(({ ID }) => ID === CalendarID);

    return !!holidaysCalendar && holidaysCalendar.ID !== inputCalendar?.ID;
};

interface Props extends ModalProps {
    /**
     * Calendars we got from the API
     */
    directory: HolidaysDirectoryCalendar[];
    /**
     * Calendar the user wants to update
     */
    calendar?: VisualCalendar;
    /**
     * Holidays calendars the user has already joined
     */
    holidaysCalendars: VisualCalendar[];
    showNotification?: boolean;
}

const HolidaysCalendarModal = ({
    directory,
    calendar: inputHolidaysCalendar,
    holidaysCalendars,
    showNotification = true,
    ...rest
}: Props) => {
    const [addresses] = useAddresses();
    const getAddresses = useGetAddresses();
    const [{ PrimaryTimezone }] = useCalendarUserSettings();
    const { call } = useEventManager();
    const api = useApi();
    const getAddressKeys = useGetAddressKeys();
    const { validator, onFormSubmit } = useFormErrors();
    const [loading, withLoading] = useLoading();
    const { createNotification } = useNotifications();
    const readCalendarBootstrap = useReadCalendarBootstrap();
    const getCalendarBootstrap = useGetCalendarBootstrap();

    const isEdit = !!inputHolidaysCalendar;

    const { inputCalendar, defaultCalendar } = useMemo(() => {
        // Directory calendar that we want to edit (when we get an input calendar)
        const inputCalendar = directory.find(({ CalendarID }) => CalendarID === inputHolidaysCalendar?.ID);
        // Default holidays calendar found based on the user time zone and language
        const defaultCalendar = getDefaultHolidaysCalendar(directory, PrimaryTimezone, languageCode);

        return { inputCalendar, defaultCalendar };
    }, [inputHolidaysCalendar, directory, PrimaryTimezone, languageCode]);

    // Check if the user has already joined the default holidays directory calendar.
    // If so, we don't want to pre-select that default calendar
    const hasAlreadyJoinedDefaultCalendar = getHasAlreadyJoinedCalendar(
        holidaysCalendars,
        defaultCalendar,
        inputHolidaysCalendar
    );
    const canPreselect = !!defaultCalendar && !hasAlreadyJoinedDefaultCalendar;

    // Currently selected option in the modal
    const [selectedCalendar, setSelectedCalendar] = useState<HolidaysDirectoryCalendar | undefined>(
        getInitialCalendar(inputCalendar, defaultCalendar, canPreselect)
    );

    // Check if currently selected holidays calendar has already been joined by the user
    // If already joined, we don't want the user to be able to "save" again, or he will get an error
    const hasAlreadyJoinedSelectedCalendar = getHasAlreadyJoinedCalendar(
        holidaysCalendars,
        selectedCalendar,
        inputHolidaysCalendar
    );

    const [inputCalendarLoading, setInputCalendarLoading] = useState(false);
    const [color, setColor] = useState(inputHolidaysCalendar?.Color || getRandomAccentColor());
    const [notifications, setNotifications] = useState<NotificationModel[]>([]); // Note that we don't need to fill this state on holiday calendar edition since this field will not be displayed

    const canShowHint = defaultCalendar && defaultCalendar === selectedCalendar && !hasAlreadyJoinedDefaultCalendar;

    // We want to display one option per country, so we need to filter them
    const filteredCalendars: HolidaysDirectoryCalendar[] = useMemo(() => {
        return uniqueBy(directory, ({ CountryCode }) => CountryCode).sort((a, b) => a.Country.localeCompare(b.Country));
    }, [holidaysCalendars]);

    // We might have several Calendars for a specific country, with different languages
    const languageOptions: HolidaysDirectoryCalendar[] = useMemo(() => {
        return getHolidaysCalendarsFromCountryCode(directory, selectedCalendar?.CountryCode || '');
    }, [selectedCalendar]);

    const handleSubmit = async () => {
        try {
            if (!onFormSubmit() || hasAlreadyJoinedSelectedCalendar) {
                return;
            }

            if (selectedCalendar) {
                /**
                 * Based on the inputHolidaysCalendar, we have several cases to cover:
                 * 1 - The user is updating colors or notifications of his holiday calendar
                 *      => We perform a classic calendar update
                 * 2 - The user is updating the country or the language of his holiday calendar
                 *      => We need to leave the old holiday calendar and then join a new one
                 * 3 - The user is joining a holiday calendar
                 *      => We just want to join a holiday calendar
                 */
                if (inputHolidaysCalendar && inputCalendar) {
                    // 1 - Classic update
                    if (selectedCalendar === inputCalendar) {
                        const calendarPayload: CalendarCreateData = {
                            Name: inputHolidaysCalendar.Name,
                            Description: inputHolidaysCalendar.Description,
                            Color: color,
                            Display: inputHolidaysCalendar.Display,
                        };
                        const calendarSettingsPayload: Required<
                            Pick<
                                CalendarSettings,
                                'DefaultEventDuration' | 'DefaultPartDayNotifications' | 'DefaultFullDayNotifications'
                            >
                        > = {
                            DefaultEventDuration: 30, // TODO check
                            DefaultFullDayNotifications: modelToNotifications(dedupeNotifications(notifications)),
                            DefaultPartDayNotifications: [],
                        };
                        await updateCalendar(
                            inputHolidaysCalendar,
                            calendarPayload,
                            calendarSettingsPayload,
                            readCalendarBootstrap,
                            getAddresses,
                            api
                        );
                    } else {
                        // 2 - Leave old holiday calendar and join a new one
                        await api(removeMember(inputHolidaysCalendar.ID, inputHolidaysCalendar.Members[0].ID));

                        const { calendarID, addressID, payload } = await getJoinHolidaysCalendarData({
                            holidaysCalendar: selectedCalendar,
                            addresses,
                            getAddressKeys,
                            color,
                            notifications,
                        });
                        await api(joinHolidaysCalendar(calendarID, addressID, payload));
                    }
                } else {
                    // 3 - Joining a holiday calendar
                    const { calendarID, addressID, payload } = await getJoinHolidaysCalendarData({
                        holidaysCalendar: selectedCalendar,
                        addresses,
                        getAddressKeys,
                        color,
                        notifications,
                    });
                    await api(joinHolidaysCalendar(calendarID, addressID, payload));

                    createNotification({
                        type: 'success',
                        text: c('Notification in holidays calendar modal').t`Calendar added`,
                    });
                }

                await call();

                rest.onClose?.();
            }
        } catch (error) {
            console.log(error);
            noop();
        }
    };

    const handleSelectCountry = (value: string) => {
        /*
         * Get the default calendar selected
         * If only one calendar in the country is found, return that one
         * Else try to get the default one based on the user language
         */
        const newSelected = findHolidaysCalendarByCountryCodeAndLanguageCode(directory, value, languageCode);
        if (newSelected) {
            setSelectedCalendar(newSelected);
        }
    };

    const handleSelectLanguage = ({ value }: { value: any }) => {
        const calendarsFromCountry = languageOptions.find((calendar) => calendar.Language === value);
        setSelectedCalendar(calendarsFromCountry);
    };

    const handleGetInputCalendarBootstrap = async (inputCalendar: VisualCalendar) => {
        setInputCalendarLoading(true);
        const { CalendarSettings } = await getCalendarBootstrap(inputCalendar.ID);
        const notifications = notificationsToModel(CalendarSettings.DefaultFullDayNotifications, true);
        setNotifications(notifications);
        setInputCalendarLoading(false);
    };

    const getErrorText = () => {
        if (hasAlreadyJoinedSelectedCalendar) {
            // TODO Check this error string with product
            return c('Error').t`You already subscribed to this holidays calendar`;
        }

        return c('Error').t`To add a holiday calendar you must select a country`;
    };

    useEffect(() => {
        if (inputHolidaysCalendar) {
            void handleGetInputCalendarBootstrap(inputHolidaysCalendar);
        }
    }, []);

    return (
        <Modal as={Form} fullscreenOnMobile onSubmit={() => withLoading(handleSubmit())} size="large" {...rest}>
            {inputCalendarLoading ? (
                <Loader />
            ) : (
                <>
                    <ModalHeader
                        title={isEdit ? c('Modal title').t`Edit calendar` : c('Modal title').t`Add public holidays`}
                        subline={
                            isEdit ? undefined : c('Modal title').t`Get a country's official public holidays calendar.`
                        }
                    />
                    <ModalContent className="holidays-calendar-modal-content">
                        <CountrySelect
                            options={filteredCalendars.map((calendar) => ({
                                countryName: calendar.Country,
                                countryCode: calendar.CountryCode,
                            }))}
                            preSelectedOption={
                                canPreselect
                                    ? {
                                          countryName: defaultCalendar.Country,
                                          countryCode: defaultCalendar.CountryCode,
                                      }
                                    : undefined
                            }
                            value={
                                selectedCalendar
                                    ? {
                                          countryName: selectedCalendar.Country,
                                          countryCode: selectedCalendar.CountryCode,
                                      }
                                    : undefined
                            }
                            preSelectedOptionDivider={c('holiday calendar').t`Based on your time zone`}
                            onSelectCountry={handleSelectCountry}
                            validator={validator}
                            error={hasAlreadyJoinedSelectedCalendar}
                            errorText={getErrorText()}
                            hint={canShowHint ? c('holiday calendar').t`Based on your time zone` : undefined}
                        />

                        {selectedCalendar && languageOptions.length > 1 && (
                            <InputFieldTwo
                                id="languageSelect"
                                as={SelectTwo}
                                label={c('Label').t`Language`}
                                value={selectedCalendar.Language}
                                onChange={handleSelectLanguage}
                                aria-describedby="label-languageSelect"
                                data-testid="holidays-calendar-modal:language-select"
                            >
                                {languageOptions.map((option) => (
                                    <Option key={option.Language} value={option.Language} title={option.Language} />
                                ))}
                            </InputFieldTwo>
                        )}

                        <InputFieldTwo
                            id="colorSelect"
                            as={ColorPicker}
                            label={c('Label').t`Color`}
                            color={color}
                            onChange={(color: string) => setColor(color)}
                            data-testid="holidays-calendar-modal:color-select"
                        />

                        {showNotification && (
                            <InputFieldTwo
                                id="default-full-day-notification"
                                as={Notifications}
                                label={c('Label').t`Notifications`}
                                hasType
                                notifications={notifications}
                                defaultNotification={getDefaultModel().defaultFullDayNotification}
                                canAdd={notifications.length < MAX_DEFAULT_NOTIFICATIONS}
                                onChange={(notifications: NotificationModel[]) => {
                                    setNotifications(notifications);
                                }}
                            />
                        )}
                    </ModalContent>
                    <ModalFooter>
                        <>
                            <Button onClick={rest.onClose}>{c('Action').t`Cancel`}</Button>
                            <Button
                                loading={loading}
                                type="submit"
                                color="norm"
                                data-testid="holidays-calendar-modal:submit"
                            >
                                {isEdit ? c('Action').t`Save` : c('Action').t`Add`}
                            </Button>
                        </>
                    </ModalFooter>
                </>
            )}
        </Modal>
    );
};

export default HolidaysCalendarModal;
