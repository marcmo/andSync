import Network.HTTP
import Network.Browser
import Network.URI(parseURI,URI)
import qualified Text.JSON as J
import qualified Data.Set as S
import Maybe(fromJust)
import Control.Monad(forM_)
import System.Posix.Directory

import Test.Framework (defaultMain, testGroup)
import Test.Framework.Providers.HUnit
import Test.Framework.Providers.QuickCheck2 (testProperty)

import Test.QuickCheck
import Test.QuickCheck.Monadic(monadicIO,run,assert)
import qualified Test.HUnit as T

main = do
    q 10 $ label "prop_createAndDeleteUsers" prop_createAndDeleteUsers
    -- defaultMain tests
      where
        q n = quickCheckWith $ stdArgs { maxSuccess = n }

tests = [
        testGroup "rest api Group" [
                -- testProperty "create/deleta users property" prop_createAndDeleteUsers
            ]
    ]

newtype User = User { name :: String } deriving (Show)
instance Arbitrary User where
  arbitrary = sized crowd
    where validStarters = "-_.()" ++ ['A'..'Z'] ++ ['a'..'z'] ++ ['0'..'9'] 
          valid = ' ':validStarters
          crowd 0 = (User . return) `fmap` elements validStarters
          crowd n | n > 50 = resize 50 arbitrary
                  | otherwise = do
                      name <- vectorOf n $ elements valid
                      starter <- elements validStarters
                      end <- elements validStarters
                      return $ User $ starter:name ++ [end]

prop_createAndDeleteUsers ::  [User] -> Property
prop_createAndDeleteUsers users = monadicIO $ do
    let names = map (\(User n)->n) users
    (J.Ok initialUsers) <- run $ getUsers >>= return . (fmap S.fromList)
    let distinctUsers = S.toList $ S.fromList names S.\\ initialUsers
    forM_ distinctUsers $ \u -> run $ putStrLn $ "user:" ++ u
    forM_ distinctUsers $ \user -> run $ createUser user
    forM_ distinctUsers $ \user -> run $ eraseOneUser user
    (J.Ok eventualUsers) <- run $ getUsers >>= return . (fmap S.fromList)
    assert $ (eventualUsers S.\\ initialUsers) == S.empty
  
serverUri x = parseURI $ "http://localhost:8080" ++ x
newUser :: URI
newUser = fromJust $ serverUri "/user/new"
listUsers = fromJust $ serverUri "/user/list"
eraseUser u = fromJust $ serverUri $ "/user/erase/" ++ (urlEncode u)

-- /user/new => create new user with form, field should contain user name
-- /user/list => list all existing user, return user as JSON object
-- for specific users:
-- /user/upload/$USER => start upload-streaming for $USER
-- /user/sha1/$USER   => get sha1 checksum for $USER
-- /user/content/$USER => get all files of $USER, returns stringified
-- list of user files
-- /user/clear/$USER => delete all files of $USER
-- /user/get/$USER/$FILE => start download of $FILE from $USER

getUsers ::  IO (J.Result [String])
getUsers = do 
  let x = listUsers
  putStrLn $ "getUsers->" ++ show x
  let r = Request { rqURI = x, rqMethod = GET, rqHeaders = [Header HdrContentLength "0"],rqBody=""}
  simpleHTTP r >>= getResponseBody >>= return . J.decode

createUser ::  String -> IO ()
createUser user = do
  putStrLn $ "createUser:" ++ user
  let f = Form POST newUser [("name", user)]
  rsp <- Network.Browser.browse $ do { setAllowRedirects True; request $ formToRequest f}
  return ()

eraseOneUser :: String -> IO (J.Result [String])
eraseOneUser user = do
  putStrLn $ "delete user:" ++ user
  let r = Request { rqURI = eraseUser user, rqMethod = GET, rqHeaders = [Header HdrContentLength "0"],rqBody=""}
  rr <- simpleHTTP r >>= getResponseBody 
  return $ J.decode rr

  

