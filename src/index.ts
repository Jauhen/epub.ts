import Book from './book';
import Contents from './contents';
import ePub from './epub';
import EpubCFI from './epubcfi';
import Layout from './layout';
import Rendition from './rendition';

// TODO: Remove in 1.0
(window as any).ePub = ePub;

export default ePub;
export { Book, EpubCFI, Rendition, Contents, Layout };
