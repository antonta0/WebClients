import { getHasMigratedAddressKeys } from '@proton/shared/lib/keys';
import { APPS } from '@proton/shared/lib/constants';
import useConfig from './useConfig';
import useAddresses from './useAddresses';
import useUser from './useUser';

const { PROTONVPN_SETTINGS } = APPS;

const useIsMnemonicAvailable = () => {
    const { APP_NAME } = useConfig();
    const [user, loadingUser] = useUser();

    const [addresses = [], loadingAddresses] = useAddresses();
    const hasMigratedKeys = getHasMigratedAddressKeys(addresses);

    const isNonPrivateUser = !user?.isPrivate;
    const isMnemonicAvailable = hasMigratedKeys && !isNonPrivateUser && APP_NAME !== PROTONVPN_SETTINGS;

    return [isMnemonicAvailable, loadingAddresses || loadingUser] as const;
};

export default useIsMnemonicAvailable;
